package com.sourcegraph.agent;

import com.sourcegraph.agent.protocol.ClientInfo;
import com.sourcegraph.agent.protocol.ExecuteRecipeParams;
import com.sourcegraph.agent.protocol.RecipeInfo;
import com.sourcegraph.agent.protocol.ServerInfo;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.eclipse.lsp4j.jsonrpc.services.JsonNotification;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;

/**
 * Interface for the server-part of the Cody agent protocol. The implementation of this interface is
 * written in TypeScript in the file "client/cody-agent/src/agent.ts". The Eclipse LSP4J bindings
 * create a Java implementation of this interface by using a JVM-reflection feature called "Proxy",
 * which works similar to JavaScript Proxy.
 */
public interface CodyAgentServer {

  // Requests
  @JsonRequest("initialize")
  CompletableFuture<ServerInfo> initialize(ClientInfo clientInfo);

  @JsonRequest("shutdown")
  CompletableFuture<Void> shutdown();

  @JsonRequest("recipes/list")
  CompletableFuture<List<RecipeInfo>> recipesList();

  @JsonRequest("recipes/execute")
  CompletableFuture<Void> recipesExecute(ExecuteRecipeParams params);

  // Notifications
  @JsonNotification("initialized")
  void initialized();

  @JsonNotification("exit")
  void exit();
}
