package com.pvz2.rfl.levelswapper;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONArray;

public class LevelHistoryWidget extends AppWidgetProvider {

    public static final String PREF_NAME = "pvz2_level_swapper_prefs";
    public static final String KEY_HISTORY = "level_history";

    public static final String ACTION_ITEM_CLICK = "com.pvz2.rfl.levelswapper.ACTION_ITEM_CLICK";
    public static final String EXTRA_ACTION_TYPE = "action_type";
    public static final String EXTRA_ITEM_INDEX = "item_index";
    public static final String ACTION_TYPE_DELETE = "delete";
    public static final String ACTION_TYPE_OPEN = "open";

    public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.level_history_widget);

        // Service intent for ListView
        Intent serviceIntent = new Intent(context, LevelHistoryWidgetService.class);
        serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list_view, serviceIntent);
        views.setEmptyView(R.id.widget_list_view, R.id.widget_empty_view);

        // PendingIntent for empty view -> open MainActivity
        Intent appIntent = new Intent(context, MainActivity.class);
        appIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int emptyFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            emptyFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent emptyPendingIntent = PendingIntent.getActivity(context, 0, appIntent, emptyFlags);
        views.setOnClickPendingIntent(R.id.widget_empty_view, emptyPendingIntent);

        // PendingIntent template for ListView items
        Intent itemClickIntent = new Intent(context, LevelHistoryWidget.class);
        itemClickIntent.setAction(ACTION_ITEM_CLICK);
        itemClickIntent.setData(Uri.parse(itemClickIntent.toUri(Intent.URI_INTENT_SCHEME)));
        int itemFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            itemFlags |= PendingIntent.FLAG_MUTABLE;
        }
        PendingIntent itemPendingIntent = PendingIntent.getBroadcast(context, 0, itemClickIntent, itemFlags);
        views.setPendingIntentTemplate(R.id.widget_list_view, itemPendingIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
        super.onUpdate(context, appWidgetManager, appWidgetIds);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);

        if (ACTION_ITEM_CLICK.equals(intent.getAction())) {
            String actionType = intent.getStringExtra(EXTRA_ACTION_TYPE);
            int itemIndex = intent.getIntExtra(EXTRA_ITEM_INDEX, -1);

            if (ACTION_TYPE_DELETE.equals(actionType) && itemIndex >= 0) {
                deleteHistoryItem(context, itemIndex);
                updateAllWidgets(context);
            } else {
                Intent appIntent = new Intent(context, MainActivity.class);
                appIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                context.startActivity(appIntent);
            }
        } else if (AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(intent.getAction())) {
            updateAllWidgets(context);
        }
    }

    private static void deleteHistoryItem(Context context, int index) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
            String jsonStr = prefs.getString(KEY_HISTORY, "[]");
            JSONArray array = new JSONArray(jsonStr);
            if (index >= 0 && index < array.length()) {
                JSONArray updated = new JSONArray();
                for (int i = 0; i < array.length(); i++) {
                    if (i != index) {
                        updated.put(array.get(i));
                    }
                }
                prefs.edit().putString(KEY_HISTORY, updated.toString()).apply();
            }
        } catch (Exception ignored) {}
    }

    public static void updateAllWidgets(Context context) {
        try {
            AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
            ComponentName thisWidget = new ComponentName(context, LevelHistoryWidget.class);
            int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget);
            if (appWidgetIds != null && appWidgetIds.length > 0) {
                appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_list_view);
                for (int id : appWidgetIds) {
                    updateAppWidget(context, appWidgetManager, id);
                }
            }
        } catch (Exception ignored) {}
    }
}
