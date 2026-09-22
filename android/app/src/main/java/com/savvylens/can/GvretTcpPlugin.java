package com.savvylens.can;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;

@CapacitorPlugin(name = "GvretTcp")
public class GvretTcpPlugin extends Plugin {
    private Socket socket;
    private OutputStream out;
    private InputStream in;
    private boolean isConnected = false;

    @PluginMethod
    public void connect(PluginCall call) {
        String ip = call.getString("ip");
        Integer port = call.getInt("port", 23);

        if (ip == null) {
            call.reject("IP address is required");
            return;
        }

        new Thread(() -> {
            try {
                if (socket != null) {
                    socket.close();
                }
                socket = new Socket(ip, port);
                out = socket.getOutputStream();
                in = socket.getInputStream();
                isConnected = true;

                call.resolve();

                byte[] buffer = new byte[1024];
                int read;
                while (isConnected && in != null && (read = in.read(buffer)) != -1) {
                    byte[] dataChunk = new byte[read];
                    System.arraycopy(buffer, 0, dataChunk, 0, read);

                    JSObject ret = new JSObject();
                    // Pass byte array
                    ret.put("data", dataChunk);
                    notifyListeners("onTcpData", ret);
                }
            } catch (Exception e) {
                isConnected = false;
                call.reject("Connection failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        isConnected = false;
        try {
            if (socket != null) {
                socket.close();
                socket = null;
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Disconnect failed: " + e.getMessage());
        }
    }
}
