package com.sourcegraph.agent;

import com.intellij.openapi.application.ApplicationManager;
import com.sourcegraph.agent.protocol.*;
import java.io.IOException;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.eclipse.lsp4j.jsonrpc.Launcher;
import org.jetbrains.annotations.NotNull;

/**
 * Orchestrator for the Cody agent, which is a Node.js program that implements the prompt logic for
 * Cody. The agent communicates via a JSON-RPC protocol that is documented in the file
 * "client/cody-agent/src/protocol.ts".
 */
public class CodyAgent {
  // TODO: actually stop the agent based on application lifecycle events

  private CodyAgentClient client;
  public static final ExecutorService executorService = Executors.newCachedThreadPool();

  public static boolean isConnected() {
    CodyAgent agent = ApplicationManager.getApplication().getService(CodyAgent.class);
    return agent != null && agent.client != null && agent.client.server != null;
  }

  @NotNull
  public static CodyAgentClient getClient() {
    return ApplicationManager.getApplication().getService(CodyAgent.class).client;
  }

  @NotNull
  public static CodyAgentServer getServer() {
    return Objects.requireNonNull(Objects.requireNonNull(getClient()).server);
  }

  public static synchronized void run() {
    if (CodyAgent.isConnected()) {
      return;
    }
    CodyAgentClient client = new CodyAgentClient();
    try {
      CodyAgent.run(client);
    } catch (Exception e) {
      e.printStackTrace();
    }
    ApplicationManager.getApplication().getService(CodyAgent.class).client = client;
  }

  public static Future<Void> run(CodyAgentClient client)
      throws IOException, ExecutionException, InterruptedException {
    Path tracePath = Paths.get(System.getenv("HOME"), ".sourcegraph", "agent-jsonrpc.json");
    Process process =
        new ProcessBuilder(
                "/Users/olafurpg/.asdf/shims/node",
                "/Users/olafurpg/dev/sourcegraph/sourcegraph/client/cody-agent/dist/agent.js")
            .redirectError(ProcessBuilder.Redirect.INHERIT)
            .start();
    System.out.println("AGENT_DEBUG " + tracePath);
    OutputStream traceOutputStream =
        Files.newOutputStream(
            tracePath, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
    Launcher<CodyAgentServer> launcher =
        new Launcher.Builder<CodyAgentServer>()
            .setRemoteInterface(CodyAgentServer.class)
            .traceMessages(new PrintWriter(traceOutputStream))
            .setExecutorService(executorService)
            .setInput(process.getInputStream())
            .setOutput(process.getOutputStream())
            .setLocalService(client)
            .create();
    CodyAgentServer server = launcher.getRemoteProxy();
    client.server = server;

    // Very ugly, but sorta works, for now...
    executorService.submit(
        () -> {
          ServerInfo info = null;
          try {
            info = server.initialize(new ClientInfo("JetBrains")).get();
            System.out.println("SERVER_INFO " + info.name);
            server.initialized();
            List<RecipeInfo> recipes = server.recipesList().get();
            System.out.println("RECIPES " + recipes);
            server
                .recipesExecute(
                    new ExecuteRecipeParams()
                        .setId("chat-question")
                        .setHumanChatInput("Hello!")
                        .setContext(
                            new StaticRecipeContext(
                                new StaticEditor("/Users/olafurpg/dev/spotify/dns-java"))))
                .get();
          } catch (Exception e) {
            e.printStackTrace();
          }
        });

    return launcher.startListening();
  }
}
