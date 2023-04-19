# Enabling Cody on Sourcegraph Enterprise

[Instructions for self-hosted Sourcegraph Enterprise](#Cody-on-self-hosted-sourcegraph-enterprise)
[Instructions for Sourcegraph Cloud](#Cody-on-sourcegraph-cloud)
[Enabling codebase-aware answers](#enabling-codebase-aware-answers)
[Turning Cody off](#turning-cody-off)

## Cody on self-hosted Sourcegraph Enterprise

### Prerequisites

- Sourcegraph 5.0.1 or above
- An Anthropic API key, that you can get from your Technical Advisor or Customer Engineer
- (Optionally) An OpenAI API key for embeddings (to power code graph context)

There are two steps required to enable Cody on your enterprise instance:

1. Enable your Sourcegraph instance
2. Configure the VS Code extension

### Step 1: Enable Cody on your Sourcegraph instance

Note that this requires site-admin privileges.

1. Cody uses one or more third-party LLM (Large Language Model) providers. Make sure you review the [Cody usage and privacy notice](https://about.sourcegraph.com/terms/cody-notice). In particular, code snippets will be sent to a third-party language model provider when you use the Cody extension.
2. To turn Cody on, you will need to set an access token for Sourcegraph to authentify with the third-party large language model provider (currently Anthropic but we may use different or several models over time). Reach out to your Sourcegraph Technical Advisor or Customer Engineer to get a key. They will create a key for you using the [anthropic console](https://console.anthropic.com/account/keys).
3. Once you have the key, go to **Site admin > Site configuration** (`/site-admin/configuration`) on your instance and set:

    ```json
    {
      // [...]
      "completions": {
        "enabled": true,
        "accessToken": "<token>",
        "model": "claude-v1",
        "provider": "anthropic"
      }
    }
    ```
4. You're done! 
5. Cody can be configured to use embeddings for code graph context to significantly improve the quality of its responses. This involves sending your entire codebase to a third-party service to generate a low-dimensional semantic representation, that is used for improved context fetching. See the [codebase-aware answers](#enabling-codebase-aware-answers) section for more.

### Step 2: Configure the VS Code extension

Now that Cody is turned on on your Sourcegraph instance, any user can configure and use the Cody VS Code extension. This does not require admin privilege.

1. If you currently have a previous version of Cody installed, uninstall it and reload VS Code before proceeding to the next steps.
1. Search for “Sourcegraph Cody” in your VS Code extension marketplace, and install it.

    <img width="500" alt="Sourcegraph Cody in VS Code Marketplace" src="https://user-images.githubusercontent.com/55068936/228114612-65402e1c-7501-44cb-a846-46c4376b9572.png">

3. Reload VS Code, and open the Cody extension. Review and accept the terms.

4. Now you'll need to point the Cody extension to your Sourcegraph instance. On your instance, go to `settings` / `access token` (`https://<your-instance>.sourcegraph.com/users/<your-instance>/settings/tokens`). Generate an access token, copy it, and set it in the Cody extension.

    <img width="1369" alt="image" src="https://user-images.githubusercontent.com/25070988/227510686-4afcb1f9-a3a5-495f-b1bf-6d661ba53cce.png">

5. In the Cody VS Code extension, set your instance URL and the access token
    
    <img width="553" alt="image" src="https://user-images.githubusercontent.com/25070988/227510233-5ce37649-6ae3-4470-91d0-71ed6c68b7ef.png">

6. See [this section](#enabling-codebase-aware-answers) on how to enable codebase-aware answers.

You're all set!

### Step 3: Try Cody!

These are a few things you can ask Cody:

- "What are popular go libraries for building CLIs?"
- Open your workspace, and ask "Do we have a React date picker component in this repository?"
- Right click on a function, and ask Cody to explain it
- Try any of the Cody recipes!

[See more Cody use cases here](use_cases.md).

<img width="510" alt="image" src="https://user-images.githubusercontent.com/25070988/227511383-aa60f074-817d-4875-af41-54558dfe1951.png">

## Cody on Sourcegraph Cloud

On Sourcegraph Cloud, Cody is a managed service and you do not need to follow the step 1 of the self-hosted guide above. 

### Step 1: Enable Cody for your instance

Cody can be enabled on demand on your Sourcegraph instance by contacting your account manager. The Sourcegraph team will refer to the [handbook](https://handbook.sourcegraph.com/departments/cloud/#managed-instance-requests).

### Step 2: Configure the VS Code extension
[See above](#step-2-configure-the-vs-code-extension).

### Step 3: Try Cody! 
[See above](#step-3-try-cody).

[Learn more about running Cody on Sourcegraph Cloud](../../cloud/index.md#cody).

## Enabling codebase-aware answers

**Pre-requisite: In order to enable codebase-aware answers for Cody, you must first [configure code graph context](code_graph_context.md).**

The `Cody: Codebase` setting in VS Code enables codebase-aware answers for the Cody extension. By setting this configuration option to the repository name on your Sourcegraph instance, Cody will be able to provide more accurate and relevant answers to your coding questions, based on the context of the codebase you are currently working in.

1. Open the VS Code workspace settings by pressing <kbd>Cmd/Ctrl+,</kbd>, (or File > Preferences (Settings) on Windows & Linux).
2. Search for the `Cody: Codebase` setting.
3. Enter the repository name as listed on your Sourcegraph instance.
   1. For example: `github.com/sourcegraph/sourcegraph` without the `https` protocol

## Turning Cody off

To turn Cody off, set `embeddings` and `completions` site-admin settings to `enabled:false` (or remove them altogether).