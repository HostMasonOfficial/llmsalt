const fetch = require("node-fetch");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const db = require("@saltcorn/data/db");

const { features, getState } = require("@saltcorn/data/db/state");
let ollamaMod;
if (features.esm_plugins) ollamaMod = require("ollama");

const getEmbedding = async (config, opts) => {
  switch (config.backend) {
    case "OpenAI":
      return await getEmbeddingOpenAICompatible(
        {
          embeddingsEndpoint: "https://api.openai.com/v1/embeddings",
          bearer: config.api_key,
          embed_model: config.embed_model,
        },
        opts
      );
    case "OpenAI-compatible API":
      return await getEmbeddingOpenAICompatible(
        {
          embeddingsEndpoint: config.embed_endpoint,
          bearer: config.api_key,
          embed_model: config.embed_model || config.model,
        },
        opts
      );
    case "OpenRouter":
      return await getEmbeddingOpenAICompatible(
        {
          embeddingsEndpoint: "https://openrouter.ai/api/v1/embeddings",
          bearer: config.api_key,
          embed_model: config.embed_model || config.model,
          referer: getState().getConfig('site_url', 'http://localhost')
        },
        opts
      );
    case "Mistral":
      return await getEmbeddingOpenAICompatible(
        {
          embeddingsEndpoint: "https://api.mistral.ai/v1/embeddings",
          bearer: config.api_key,
          embed_model: config.embed_model || config.model,
        },
        opts
      );
    case "Local Ollama":
      if (config.embed_endpoint) {
        return await getEmbeddingOpenAICompatible(
          {
            embeddingsEndpoint: config.embed_endpoint,
            embed_model: config.embed_model || config.model,
          },
          opts
        );
      } else {
        if (!ollamaMod) throw new Error("Not implemented for this backend");

        const { Ollama } = ollamaMod;
        const ollama = new Ollama();
        const olres = await ollama.embeddings({
          model: opts?.model || config.embed_model || config.model,
          prompt: opts.prompt,
        });
        return olres.embedding;
      }
    default:
      throw new Error("Not implemented for this backend");
  }
};

const getCompletion = async (config, opts) => {
  switch (config.backend) {
    case "OpenAI":
      return await getCompletionOpenAICompatible(
        {
          chatCompleteEndpoint: "https://api.openai.com/v1/chat/completions",
          bearer: config.api_key,
          model: config.model,
        },
        opts
      );
    case "OpenAI-compatible API":
      return await getCompletionOpenAICompatible(
        {
          chatCompleteEndpoint: config.endpoint,
          bearer: config.bearer,
          model: config.model,
        },
        opts
      );
    case "OpenRouter":
      return await getCompletionOpenAICompatible(
        {
          chatCompleteEndpoint: "https://openrouter.ai/api/v1/chat/completions",
          bearer: config.api_key,
          model: opts.model || config.model,
          referer: getState().getConfig('site_url', 'http://localhost')
        },
        opts
      );
    case "Mistral":
      return await getCompletionOpenAICompatible(
        {
          chatCompleteEndpoint: "https://api.mistral.ai/v1/chat/completions",
          bearer: config.api_key,
          model: opts.model || config.model,
        },
        opts
      );
    case "Local Ollama":
      if (!ollamaMod) throw new Error("Not implemented for this backend");

      const { Ollama } = ollamaMod;

      const ollama = new Ollama();
      const olres = await ollama.generate({
        model: config.model,
        ...opts,
      });
      return olres.response;
    case "Local llama.cpp":
      const isRoot = db.getTenantSchema() === db.connectObj.default_schema;
      if (!isRoot)
        throw new Error(
          "llama.cpp inference is not permitted on subdomain tenants"
        );
      let hyperStr = "";
      if (opts.temperature) hyperStr += ` --temp ${opts.temperature}`;
      let nstr = "";
      if (opts.ntokens) nstr = `-n ${opts.ntokens}`;

      const { stdout, stderr } = await exec(
        `./main -m ${config.model_path} -p "${opts.prompt}" ${nstr}${hyperStr}`,
        { cwd: config.llama_dir }
      );
      return stdout;
    default:
      break;
  }
};

const getCompletionOpenAICompatible = async (
  { chatCompleteEndpoint, bearer, model, referer },
  { systemPrompt, prompt, temperature, debugResult, chat = [], ...rest }
) => {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (bearer) headers.Authorization = "Bearer " + bearer;
  if (referer) headers["HTTP-Referer"] = referer;

  const body = {
    model: rest.model || model,
    messages: [
      {
        role: "system",
        content: systemPrompt || "You are a helpful assistant.",
      },
      ...chat,
      { role: "user", content: prompt },
    ],
    temperature: temperature || 0.7,
    ...rest,
  };
  
  if (debugResult) console.log("API request", JSON.stringify(body, null, 2));
  
  const rawResponse = await fetch(chatCompleteEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  
  const results = await rawResponse.json();
  if (debugResult)
    console.log("API response", JSON.stringify(results, null, 2));
  
  if (results.error) throw new Error(`API error: ${results.error.message}`);

  return (
    results?.choices?.[0]?.message?.content ||
    (results?.choices?.[0]?.message?.tool_calls
      ? { tool_calls: results?.choices?.[0]?.message?.tool_calls }
      : null)
  );
};

const getEmbeddingOpenAICompatible = async (
  { embeddingsEndpoint, bearer, embed_model, referer },
  { prompt, model, debugResult }
) => {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (bearer) headers.Authorization = "Bearer " + bearer;
  if (referer) headers["HTTP-Referer"] = referer;

  const body = {
    model: model || embed_model || "text-embedding-3-small",
    input: prompt,
  };

  const rawResponse = await fetch(embeddingsEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const results = await rawResponse.json();
  if (debugResult)
    console.log("API response", JSON.stringify(results, null, 2));
  if (results.error) throw new Error(`API error: ${results.error.message}`);
  if (Array.isArray(prompt)) return results?.data?.map?.((d) => d?.embedding);
  return results?.data?.[0]?.embedding;
};

module.exports = { getCompletion, getEmbedding };
