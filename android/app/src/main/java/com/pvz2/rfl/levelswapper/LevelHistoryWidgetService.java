package com.pvz2.rfl.levelswapper;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class LevelHistoryWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new LevelHistoryViewsFactory(this.getApplicationContext());
    }
}

class LevelHistoryViewsFactory implements RemoteViewsService.RemoteViewsFactory {

    private final Context context;
    private final List<LevelHistoryRow> items = new ArrayList<>();
    private static final Pattern DIGIT_PATTERN = Pattern.compile("(\\d+)");

    public static class LevelHistoryRow {
        public final String customTitle;
        public final String targetTitle;

        public LevelHistoryRow(String customTitle, String targetTitle) {
            this.customTitle = customTitle;
            this.targetTitle = targetTitle;
        }
    }

    public LevelHistoryViewsFactory(Context context) {
        this.context = context;
    }

    @Override
    public void onCreate() {
        loadData();
    }

    @Override
    public void onDataSetChanged() {
        loadData();
    }

    private void loadData() {
        items.clear();
        try {
            SharedPreferences prefs = context.getSharedPreferences(LevelHistoryWidget.PREF_NAME, Context.MODE_PRIVATE);
            String jsonStr = prefs.getString(LevelHistoryWidget.KEY_HISTORY, "[]");
            JSONArray array = new JSONArray(jsonStr);
            int count = Math.min(array.length(), 30);
            for (int i = 0; i < count; i++) {
                JSONObject obj = array.getJSONObject(i);

                // 1. Get Custom Level Title
                String title = obj.optString("levelTitle", "").trim();
                if (title.isEmpty()) {
                    String orig = obj.optString("originalName", "Custom Level");
                    title = orig.replaceAll("(?i)\\.json$", "").trim();
                }

                // If level name has a dash like "Penny's Challenge - Trouble on the Double", take second part
                if (title.contains("-")) {
                    String[] parts = title.split("\\s*-\\s*", 2);
                    if (parts.length > 1 && !parts[1].trim().isEmpty()) {
                        title = parts[1].trim();
                    }
                }

                // 2. Get Target World & Day/Night label
                String targetDisplay = obj.optString("targetDisplay", "").trim();
                if (targetDisplay.isEmpty()) {
                    String repl = obj.optString("replacedName", "");
                    String world = obj.optString("worldName", "");
                    String worldId = obj.optString("worldId", "").toLowerCase();

                    int dayNum = 1;
                    if (!repl.isEmpty()) {
                        Matcher matcher = DIGIT_PATTERN.matcher(repl);
                        if (matcher.find()) {
                            try {
                                dayNum = Integer.parseInt(matcher.group(1));
                            } catch (Exception ignored) {}
                        }
                    }

                    if (worldId.isEmpty() && !repl.isEmpty()) {
                        worldId = repl.replaceAll("\\d+.*", "").toLowerCase();
                    }

                    // Dark Ages, Caliginous Carnival, and Lost City (33-42) are Night levels
                    boolean isNight = "dark".equals(worldId) ||
                                      "carnival".equals(worldId) ||
                                      ("city".equals(worldId) && dayNum >= 33 && dayNum <= 42) ||
                                      world.toLowerCase().contains("dark ages") ||
                                      world.toLowerCase().contains("carnival") ||
                                      (world.toLowerCase().contains("lost city") && dayNum >= 33 && dayNum <= 42);

                    String prefix = isNight ? "Night " : "Day ";
                    if (!world.isEmpty()) {
                        targetDisplay = world + " - " + prefix + dayNum;
                    } else {
                        targetDisplay = prefix + dayNum;
                    }
                }

                items.add(new LevelHistoryRow(title, targetDisplay));
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onDestroy() {
        items.clear();
    }

    @Override
    public int getCount() {
        return items.size();
    }

    @Override
    public RemoteViews getViewAt(int position) {
        if (position < 0 || position >= items.size()) {
            return null;
        }

        LevelHistoryRow row = items.get(position);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_history_item);

        // Bind left side (custom title) and right side (target world level)
        views.setTextViewText(R.id.item_custom_title, row.customTitle);
        views.setTextViewText(R.id.item_arrow, "->");
        views.setTextViewText(R.id.item_target_title, row.targetTitle);

        // Click on the row/text -> open app
        Intent openIntent = new Intent();
        openIntent.putExtra(LevelHistoryWidget.EXTRA_ACTION_TYPE, LevelHistoryWidget.ACTION_TYPE_OPEN);
        openIntent.putExtra(LevelHistoryWidget.EXTRA_ITEM_INDEX, position);
        views.setOnClickFillInIntent(R.id.item_root, openIntent);

        // Click on the trash bin icon -> delete this item
        Intent deleteIntent = new Intent();
        deleteIntent.putExtra(LevelHistoryWidget.EXTRA_ACTION_TYPE, LevelHistoryWidget.ACTION_TYPE_DELETE);
        deleteIntent.putExtra(LevelHistoryWidget.EXTRA_ITEM_INDEX, position);
        views.setOnClickFillInIntent(R.id.item_delete_btn, deleteIntent);

        return views;
    }

    @Override
    public RemoteViews getLoadingView() {
        return null;
    }

    @Override
    public int getViewTypeCount() {
        return 1;
    }

    @Override
    public long getItemId(int position) {
        return position;
    }

    @Override
    public boolean hasStableIds() {
        return true;
    }
}
