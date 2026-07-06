package io.github.lucasfleury.palantirworker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class ProtocolServerTest {
    private final Gson gson = new Gson();

    @Test
    void performsHandshake() throws Exception {
        JsonObject response = exchange(
                """
                {"protocolVersion":1,"id":"init-1","method":"initialize","params":{}}
                """);
        assertEquals(1, response.get("protocolVersion").getAsInt());
        assertEquals("init-1", response.get("id").getAsString());
        assertEquals("0.1.0", response.getAsJsonObject("result").get("workerVersion").getAsString());
        assertEquals("2.91.0", response.getAsJsonObject("result").get("formatterVersion").getAsString());
    }

    @Test
    void formatsDocument() throws Exception {
        JsonObject response = exchange(
                """
                {"protocolVersion":1,"id":"format-1","method":"formatDocument","params":{"source":"class Example{}"}}
                """);
        assertEquals("class Example {}\n", response.getAsJsonObject("result").get("formatted").getAsString());
    }

    @Test
    void returnsStructuredFormatError() throws Exception {
        JsonObject response = exchange(
                """
                {"protocolVersion":1,"id":"format-2","method":"formatDocument","params":{"source":"class {"}}
                """);
        assertEquals("FORMAT_ERROR", response.getAsJsonObject("error").get("code").getAsString());
    }

    @Test
    void rejectsMalformedJson() throws Exception {
        JsonObject response = exchange("{not-json}\n");
        assertTrue(response.get("id").isJsonNull());
        assertEquals("INVALID_REQUEST", response.getAsJsonObject("error").get("code").getAsString());
    }

    @Test
    void rejectsIncompatibleProtocol() throws Exception {
        JsonObject response = exchange(
                """
                {"protocolVersion":99,"id":"bad-version","method":"initialize","params":{}}
                """);
        assertEquals(
                "INCOMPATIBLE_PROTOCOL", response.getAsJsonObject("error").get("code").getAsString());
    }

    @Test
    void rejectsFractionalProtocolVersion() throws Exception {
        JsonObject response = exchange(
                """
                {"protocolVersion":1.5,"id":"bad-version","method":"initialize","params":{}}
                """);
        assertEquals("INVALID_REQUEST", response.getAsJsonObject("error").get("code").getAsString());
    }

    @Test
    void rejectsUnsupportedRequestProperties() throws Exception {
        JsonObject response = exchange(
                """
                {"protocolVersion":1,"id":"extra","method":"initialize","params":{},"unexpected":true}
                """);
        assertEquals("extra", response.get("id").getAsString());
        assertEquals("INVALID_REQUEST", response.getAsJsonObject("error").get("code").getAsString());
    }

    @Test
    void keepsStdoutProtocolOnlyAndDoesNotLogSource() throws Exception {
        String secret = "DO_NOT_LOG_THIS_SOURCE";
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ByteArrayOutputStream error = new ByteArrayOutputStream();
        String request = "{\"protocolVersion\":1,\"id\":\"unicode\",\"method\":\"formatDocument\","
                + "\"params\":{\"source\":\"class Café{String value=\\\""
                + secret
                + "\\\";}\"}}\n";
        runServer(request, output, error);

        String stdout = output.toString(StandardCharsets.UTF_8);
        assertEquals(1, stdout.lines().count());
        assertFalse(error.toString(StandardCharsets.UTF_8).contains(secret));
    }

    private JsonObject exchange(String request) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        runServer(request, output, new ByteArrayOutputStream());
        return gson.fromJson(output.toString(StandardCharsets.UTF_8).lines().findFirst().orElseThrow(), JsonObject.class);
    }

    private static void runServer(String request, ByteArrayOutputStream output, ByteArrayOutputStream error)
            throws Exception {
        ByteArrayInputStream input = new ByteArrayInputStream(request.getBytes(StandardCharsets.UTF_8));
        new ProtocolServer(input, output, error, new PalantirFormatter()).run();
    }
}
