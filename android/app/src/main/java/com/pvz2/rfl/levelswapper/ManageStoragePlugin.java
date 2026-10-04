package com.pvz2.rfl.levelswapper;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.UriPermission;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "ManageStorage")
public class ManageStoragePlugin extends Plugin {

    private static final String PREF_NAME = "pvz2_level_swapper_prefs";
    private static final String KEY_TREE_URI = "saved_tree_uri";
    private static final String KEY_HISTORY = "level_history";

    @PluginMethod
    public void getLevelHistory(PluginCall call) {
        try {
            String jsonStr = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                    .getString(KEY_HISTORY, "[]");
            JSONArray array = new JSONArray(jsonStr);
            JSArray jsArray = new JSArray();
            for (int i = 0; i < array.length(); i++) {
                jsArray.put(new JSObject(array.getJSONObject(i).toString()));
            }
            JSObject ret = new JSObject();
            ret.put("history", jsArray);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed reading level history: " + e.getMessage());
        }
    }

    @PluginMethod
    public void saveLevelHistory(PluginCall call) {
        try {
            JSArray historyArray = call.getArray("history");
            if (historyArray == null) {
                historyArray = new JSArray();
            }
            getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_HISTORY, historyArray.toString())
                    .apply();

            // Refresh the home screen widget immediately
            LevelHistoryWidget.updateAllWidgets(getContext());

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("count", historyArray.length());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed saving level history: " + e.getMessage());
        }
    }

    @PluginMethod
    public void clearLevelHistory(PluginCall call) {
        try {
            getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_HISTORY, "[]")
                    .apply();

            // Refresh the home screen widget immediately
            LevelHistoryWidget.updateAllWidgets(getContext());

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed clearing level history: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            granted = Environment.isExternalStorageManager();
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Intent intent;
                try {
                    intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                    intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
                    getActivity().startActivity(intent);
                } catch (Exception e) {
                    intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                    getActivity().startActivity(intent);
                }
            } else {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
                getActivity().startActivity(intent);
            }
            call.resolve();
        } catch (Exception ex) {
            call.reject("Could not open settings: " + ex.getMessage());
        }
    }

    @PluginMethod
    public void checkGameFolder(PluginCall call) {
        String savedUriStr = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .getString(KEY_TREE_URI, null);

        boolean hasFolder = false;
        String folderName = "";

        if (savedUriStr != null) {
            Uri savedUri = Uri.parse(savedUriStr);
            List<UriPermission> perms = getContext().getContentResolver().getPersistedUriPermissions();
            for (UriPermission p : perms) {
                if (p.getUri().equals(savedUri) && p.isWritePermission()) {
                    DocumentFile df = DocumentFile.fromTreeUri(getContext(), savedUri);
                    if (df != null && df.exists()) {
                        hasFolder = true;
                        folderName = df.getName() != null ? df.getName() : "Selected Folder";
                        break;
                    }
                }
            }
        }

        JSObject ret = new JSObject();
        ret.put("hasFolder", hasFolder);
        ret.put("folderUri", savedUriStr != null ? savedUriStr : "");
        ret.put("folderName", folderName);
        call.resolve(ret);
    }

    @PluginMethod
    public void pickGameFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);

        // Pre-navigate to Android/data/com.ea.game.pvz2_rfl
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Uri initialUri = Uri.parse("content://com.android.externalstorage.documents/document/primary:Android%2Fdata%2Fcom.ea.game.pvz2_rfl");
                intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, initialUri);
            } catch (Exception ignored) {}
        }

        startActivityForResult(call, intent, "folderPickerResult");
    }

    @ActivityCallback
    private void folderPickerResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            Uri treeUri = result.getData().getData();
            if (treeUri != null) {
                try {
                    int takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
                    getContext().getContentResolver().takePersistableUriPermission(treeUri, takeFlags);

                    getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                            .edit()
                            .putString(KEY_TREE_URI, treeUri.toString())
                            .apply();

                    DocumentFile df = DocumentFile.fromTreeUri(getContext(), treeUri);
                    String folderName = df != null && df.getName() != null ? df.getName() : "Folder";

                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("uri", treeUri.toString());
                    ret.put("folderName", folderName);
                    call.resolve(ret);
                    return;
                } catch (Exception e) {
                    call.reject("Failed to take folder permission: " + e.getMessage());
                    return;
                }
            }
        }
        call.reject("Folder selection was cancelled");
    }

    @PluginMethod
    public void installLevelsSAF(PluginCall call) {
        String savedUriStr = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .getString(KEY_TREE_URI, null);

        if (savedUriStr == null) {
            call.reject("No game folder granted yet. Please grant folder access first.");
            return;
        }

        Uri treeUri = Uri.parse(savedUriStr);
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
        if (root == null || !root.exists()) {
            call.reject("Saved game folder is not accessible. Please re-select the folder.");
            return;
        }

        DocumentFile levelsDir = findLevelsDirectory(root);
        if (levelsDir == null || !levelsDir.exists()) {
            call.reject("Could not locate the 'levels' folder inside the granted folder. Please ensure you granted access to com.ea.game.pvz2_rfl, No_Backup, or the levels folder.");
            return;
        }

        JSArray filesArray = call.getArray("files");
        boolean deleteOriginal = Boolean.TRUE.equals(call.getBoolean("deleteOriginal", true));

        if (filesArray == null || filesArray.length() == 0) {
            call.reject("No files provided for installation.");
            return;
        }

        List<String> installedFiles = new ArrayList<>();
        List<String> deletedFiles = new ArrayList<>();

        try {
            for (int i = 0; i < filesArray.length(); i++) {
                JSONObject item = filesArray.getJSONObject(i);
                String newFileName = item.getString("newFileName");
                String content = item.getString("content");
                String originalName = item.optString("originalName", "");

                // Check if target file already exists in levels, remove it to overwrite cleanly
                DocumentFile existing = levelsDir.findFile(newFileName);
                if (existing != null && existing.exists()) {
                    existing.delete();
                }

                DocumentFile newFile = levelsDir.createFile("application/json", newFileName);
                if (newFile == null) {
                    call.reject("Could not create file: " + newFileName);
                    return;
                }

                OutputStream os = getContext().getContentResolver().openOutputStream(newFile.getUri(), "wt");
                if (os != null) {
                    os.write(content.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                    os.close();
                }

                installedFiles.add(newFileName);

                // Delete original unrenamed file if requested
                if (deleteOriginal && !originalName.isEmpty() && !originalName.equalsIgnoreCase(newFileName)) {
                    DocumentFile origFile = levelsDir.findFile(originalName);
                    if (origFile != null && origFile.exists()) {
                        if (origFile.delete()) {
                            deletedFiles.add(originalName);
                        }
                    }
                }
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("installedCount", installedFiles.size());
            ret.put("installedFiles", new JSArray(installedFiles));
            ret.put("deletedFiles", new JSArray(deletedFiles));
            ret.put("levelsFolderUri", levelsDir.getUri().toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed writing files: " + e.getMessage());
        }
    }

    @PluginMethod
    public void removeLevelsSAF(PluginCall call) {
        String savedUriStr = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .getString(KEY_TREE_URI, null);

        if (savedUriStr == null) {
            call.reject("No game folder granted.");
            return;
        }

        Uri treeUri = Uri.parse(savedUriStr);
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
        DocumentFile levelsDir = findLevelsDirectory(root);

        if (levelsDir == null || !levelsDir.exists()) {
            call.reject("Could not locate 'levels' folder to delete files.");
            return;
        }

        JSArray filesArray = call.getArray("files");
        int deletedCount = 0;

        try {
            if (filesArray != null) {
                for (int i = 0; i < filesArray.length(); i++) {
                    String fileName = filesArray.getString(i);
                    // Extract just filename if full path was passed
                    if (fileName.contains("/")) {
                        fileName = fileName.substring(fileName.lastIndexOf('/') + 1);
                    }
                    DocumentFile f = levelsDir.findFile(fileName);
                    if (f != null && f.exists()) {
                        if (f.delete()) {
                            deletedCount++;
                        }
                    }
                }
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("deletedCount", deletedCount);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed deleting files: " + e.getMessage());
        }
    }

    private DocumentFile findLevelsDirectory(DocumentFile root) {
        if (root == null || !root.exists()) return null;

        // 1. Root itself is named "levels"
        if ("levels".equalsIgnoreCase(root.getName())) {
            return root;
        }

        // 2. Direct child is "levels"
        DocumentFile directLevels = root.findFile("levels");
        if (directLevels != null && directLevels.isDirectory()) {
            return directLevels;
        }

        // 3. Search for "No_Backup"
        DocumentFile noBackup = findFolderRecursively(root, "No_Backup", 3);
        if (noBackup != null) {
            DocumentFile latestCdn = findLatestCdnFolder(noBackup);
            if (latestCdn != null) {
                DocumentFile levels = latestCdn.findFile("levels");
                if (levels == null) {
                    levels = latestCdn.createDirectory("levels");
                }
                return levels;
            }
        }

        // 4. Search for CDN.* directly inside root
        DocumentFile latestCdn = findLatestCdnFolder(root);
        if (latestCdn != null) {
            DocumentFile levels = latestCdn.findFile("levels");
            if (levels == null) {
                levels = latestCdn.createDirectory("levels");
            }
            return levels;
        }

        // 5. Deep search for "levels" folder
        return findFolderRecursively(root, "levels", 4);
    }

    private DocumentFile findLatestCdnFolder(DocumentFile parent) {
        if (parent == null || !parent.isDirectory()) return null;
        DocumentFile[] files = parent.listFiles();
        DocumentFile latest = null;
        int[] latestVer = null;

        for (DocumentFile f : files) {
            if (f.isDirectory() && f.getName() != null && f.getName().toUpperCase().startsWith("CDN.")) {
                int[] ver = parseVersion(f.getName());
                if (latest == null || compareVersions(ver, latestVer) > 0) {
                    latest = f;
                    latestVer = ver;
                }
            }
        }
        return latest;
    }

    private int[] parseVersion(String name) {
        String clean = name.replaceFirst("(?i)^CDN\\.", "");
        String[] parts = clean.split("\\.");
        int[] res = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            try {
                res[i] = Integer.parseInt(parts[i]);
            } catch (Exception e) {
                res[i] = 0;
            }
        }
        return res;
    }

    private int compareVersions(int[] a, int[] b) {
        if (a == null) return -1;
        if (b == null) return 1;
        int len = Math.max(a.length, b.length);
        for (int i = 0; i < len; i++) {
            int vA = i < a.length ? a[i] : 0;
            int vB = i < b.length ? b[i] : 0;
            if (vA != vB) return vA - vB;
        }
        return 0;
    }

    private DocumentFile findFolderRecursively(DocumentFile current, String targetName, int maxDepth) {
        if (current == null || maxDepth < 0) return null;
        if (targetName.equalsIgnoreCase(current.getName())) return current;

        DocumentFile direct = current.findFile(targetName);
        if (direct != null && direct.isDirectory()) return direct;

        if (maxDepth > 0) {
            DocumentFile[] children = current.listFiles();
            for (DocumentFile child : children) {
                if (child.isDirectory()) {
                    DocumentFile found = findFolderRecursively(child, targetName, maxDepth - 1);
                    if (found != null) return found;
                }
            }
        }
        return null;
    }
}

