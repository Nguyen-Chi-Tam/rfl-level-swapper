package com.pvz2.rfl.levelswapper;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ManageStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

