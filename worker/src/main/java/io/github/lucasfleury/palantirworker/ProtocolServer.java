package io.github.lucasfleury.palantirworker;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.palantir.javaformat.java.FormatterException;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.PrintStream;
import java.io.PrintWriter;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;
import java.util.Set;

public final class ProtocolServer {
    static final int PROTOCOL_VERSION = 1;
    private static final Properties METADATA = loadMetadata();
    static final String WORKER_VERSION = metadata("worker.version");
    static final String FORMATTER_VERSION = metadata("formatter.version");
    private static final Set<String> REQUEST_PROPERTIES = Set.of("protocolVersion", "id", "method", "params");

    private final BufferedReader input;
    private final PrintWriter output;
    private final PrintStream error;
    private final PalantirFormatter formatter;
    private final Gson gson = new GsonBuilder().serializeNulls().create();

    public ProtocolServer(InputStream input, OutputStream output, OutputStream error, PalantirFormatter formatter) {
        this.input = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8));
        this.output = new PrintWriter(output, true, StandardCharsets.UTF_8);
        this.error = new PrintStream(error, true, StandardCharsets.UTF_8);
        this.formatter = formatter;
    }

    public void run() throws IOException {
        error.println("Palantir formatter worker " + WORKER_VERSION + " started.");
        String line;
        while ((line = input.readLine()) != null) {
            if (!handleLine(line)) {
                break;
            }
        }
        error.println("Palantir formatter worker stopped.");
    }

    private boolean handleLine(String line) {
        JsonObject request;
        try {
            JsonElement parsed = gson.fromJson(line, JsonElement.class);
            if (parsed == null || !parsed.isJsonObject()) {
                sendError(null, "INVALID_REQUEST", "Request must be a JSON object.");
                return true;
            }
            request = parsed.getAsJsonObject();
        } catch (JsonParseException exception) {
            sendError(null, "INVALID_REQUEST", "Request is not valid JSON.");
            return true;
        }

        String id = getString(request, "id");
        if (id == null || id.isBlank()) {
            sendError(null, "INVALID_REQUEST", "Request id must be a non-empty string.");
            return true;
        }

        if (!hasOnlyProperties(request, REQUEST_PROPERTIES)) {
            sendError(id, "INVALID_REQUEST", "Request contains unsupported properties.");
            return true;
        }

        Integer protocolVersion = getInteger(request, "protocolVersion");
        if (protocolVersion == null) {
            sendError(id, "INVALID_REQUEST", "protocolVersion must be an integer.");
            return true;
        }
        if (protocolVersion != PROTOCOL_VERSION) {
            sendError(
                    id,
                    "INCOMPATIBLE_PROTOCOL",
                    "Unsupported protocol version " + protocolVersion + "; expected " + PROTOCOL_VERSION + ".");
            return true;
        }

        String method = getString(request, "method");
        JsonObject params = getObject(request, "params");
        if (method == null || params == null) {
            sendError(id, "INVALID_REQUEST", "method must be a string and params must be an object.");
            return true;
        }

        return switch (method) {
            case "initialize" -> {
                sendResult(
                        id,
                        Map.of("workerVersion", WORKER_VERSION, "formatterVersion", FORMATTER_VERSION));
                yield true;
            }
            case "formatDocument" -> {
                formatDocument(id, params);
                yield true;
            }
            case "shutdown" -> {
                sendResult(id, Map.of());
                yield false;
            }
            default -> {
                sendError(id, "METHOD_NOT_FOUND", "Unknown method: " + method);
                yield true;
            }
        };
    }

    private void formatDocument(String id, JsonObject params) {
        String source = getString(params, "source");
        if (source == null) {
            sendError(id, "INVALID_REQUEST", "formatDocument params.source must be a string.");
            return;
        }
        try {
            sendResult(id, Map.of("formatted", formatter.format(source)));
        } catch (FormatterException exception) {
            sendError(id, "FORMAT_ERROR", safeMessage(exception));
        } catch (RuntimeException exception) {
            error.println("Unexpected formatting failure: " + exception.getClass().getSimpleName());
            sendError(id, "INTERNAL_ERROR", "Unexpected formatter failure.");
        }
    }

    private void sendResult(String id, Object result) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("protocolVersion", PROTOCOL_VERSION);
        response.put("id", id);
        response.put("result", result);
        output.println(gson.toJson(response));
    }

    private void sendError(String id, String code, String message) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("protocolVersion", PROTOCOL_VERSION);
        response.put("id", id);
        response.put("error", Map.of("code", code, "message", message));
        output.println(gson.toJson(response));
    }

    private static String safeMessage(FormatterException exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "Java source could not be formatted." : message;
    }

    private static String getString(JsonObject object, String name) {
        JsonElement value = object.get(name);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) {
            return null;
        }
        return value.getAsString();
    }

    private static Integer getInteger(JsonObject object, String name) {
        JsonElement value = object.get(name);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) {
            return null;
        }
        try {
            BigDecimal number = value.getAsBigDecimal();
            return number.intValueExact();
        } catch (ArithmeticException | NumberFormatException exception) {
            return null;
        }
    }

    private static boolean hasOnlyProperties(JsonObject object, Set<String> allowedProperties) {
        return allowedProperties.containsAll(object.keySet());
    }

    private static JsonObject getObject(JsonObject object, String name) {
        JsonElement value = object.get(name);
        return value != null && value.isJsonObject() ? value.getAsJsonObject() : null;
    }

    private static Properties loadMetadata() {
        Properties properties = new Properties();
        try (InputStream stream = ProtocolServer.class.getResourceAsStream("/worker-version.properties")) {
            if (stream == null) {
                throw new IllegalStateException("Missing worker-version.properties.");
            }
            properties.load(stream);
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to read worker metadata.", exception);
        }
        return properties;
    }

    private static String metadata(String name) {
        String value = METADATA.getProperty(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("Missing worker metadata property: " + name);
        }
        return value;
    }
}
