/**
 * providerRegistry.js - Central registration of AI providers for the
 * @synesis chat participant. Lets the researcher pick Anthropic, OpenAI,
 * Google Gemini, or OpenRouter, each with its own API key stored via
 * VSCode's SecretStorage (encrypted by the OS, never synced between
 * machines) instead of a plaintext setting.
 */

const vscode = require('vscode');
const { AnthropicModelProvider } = require('./providers/anthropicModelProvider');
const { OpenAiCompatibleModelProvider } = require('./providers/openAiCompatibleModelProvider');
const { GeminiModelProvider } = require('./providers/geminiModelProvider');

const SECRET_KEYS = {
    anthropic: 'synesis.apiKey.anthropic',
    openai: 'synesis.apiKey.openai',
    gemini: 'synesis.apiKey.gemini',
    openrouter: 'synesis.apiKey.openrouter'
};

const PROVIDERS = [
    {
        id: 'anthropic',
        vendor: 'synesis-anthropic',
        label: 'Anthropic (Claude)',
        keyHint: 'sk-ant-...',
        validate: (v) => v.startsWith('sk-ant-')
    },
    {
        id: 'openai',
        vendor: 'synesis-openai',
        label: 'OpenAI (GPT)',
        keyHint: 'sk-...',
        validate: (v) => v.startsWith('sk-') && !v.startsWith('sk-ant-') && !v.startsWith('sk-or-')
    },
    {
        id: 'gemini',
        vendor: 'synesis-gemini',
        label: 'Google Gemini',
        keyHint: 'AIza...',
        validate: (v) => v.length > 10
    },
    {
        id: 'openrouter',
        vendor: 'synesis-openrouter',
        label: 'OpenRouter (multi-modelo, inclui opções gratuitas)',
        keyHint: 'sk-or-v1-...',
        validate: (v) => v.startsWith('sk-or-')
    }
];

const OPENROUTER_MODELS = [
    { id: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash (OpenRouter)', maxInputTokens: 1000000, maxOutputTokens: 8192 },
    { id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B — grátis (OpenRouter)', maxInputTokens: 131072, maxOutputTokens: 8192 },
    { id: 'nvidia/nemotron-nano-9b-v2:free', name: 'Nemotron Nano 9B — grátis (OpenRouter)', maxInputTokens: 128000, maxOutputTokens: 8192 },
    { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5 (via OpenRouter)', maxInputTokens: 200000, maxOutputTokens: 8192 }
];

const OPENAI_MODELS = [
    { id: 'gpt-5.1', name: 'GPT-5.1 (Synesis)', maxInputTokens: 400000, maxOutputTokens: 16384 },
    { id: 'gpt-5.1-mini', name: 'GPT-5.1 Mini (Synesis)', maxInputTokens: 400000, maxOutputTokens: 16384 }
];

function getApiKeyGetter(context, providerId) {
    return () => context.secrets.get(SECRET_KEYS[providerId]);
}

function buildProvider(context, providerId) {
    const getApiKey = getApiKeyGetter(context, providerId);
    switch (providerId) {
        case 'anthropic':
            return new AnthropicModelProvider(getApiKey);
        case 'openai':
            return new OpenAiCompatibleModelProvider({
                vendorLabel: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                models: OPENAI_MODELS,
                getApiKey
            });
        case 'openrouter':
            return new OpenAiCompatibleModelProvider({
                vendorLabel: 'OpenRouter',
                baseUrl: 'https://openrouter.ai/api/v1',
                models: OPENROUTER_MODELS,
                getApiKey
            });
        case 'gemini':
            return new GeminiModelProvider(getApiKey);
        default:
            throw new Error(`Provedor desconhecido: ${providerId}`);
    }
}

/** Registra um LanguageModelChatProvider por provedor — cada um só aparece no
 * seletor nativo se tiver API key configurada (provideLanguageModelChatInformation
 * devolve lista vazia quando a chave não existe, então o provedor "existe" mas
 * fica invisível até o pesquisador configurar). */
function registerAllProviders(context) {
    const disposables = [];
    for (const provider of PROVIDERS) {
        const instance = buildProvider(context, provider.id);
        disposables.push(vscode.lm.registerLanguageModelChatProvider(provider.vendor, instance));
    }
    return disposables;
}

/**
 * Provedor preferido, de `synesisExplorer.chat.preferredProvider`.
 *
 * A preferência não *escolhe* o modelo — quem escolhe é o seletor da caixa de
 * chat, que é do VSCode. O que ela faz é encurtar o caminho: o provedor
 * preferido aparece primeiro na lista de configuração, marcado. Vazio (o
 * padrão) mantém a ordem original.
 */
function readPreferredProviderId() {
    return String(
        vscode.workspace.getConfiguration('synesisExplorer.chat').get('preferredProvider') || ''
    ).trim();
}

/** Comando "Synesis: Configurar Provedor de IA" — QuickPick de provedor + InputBox de chave. */
async function configureProviderCommand(context) {
    const preferred = readPreferredProviderId();
    const ordered = preferred
        ? [...PROVIDERS].sort((a, b) => (b.id === preferred) - (a.id === preferred))
        : PROVIDERS;

    const picked = await vscode.window.showQuickPick(
        ordered.map((p) => ({
            label: p.label,
            description: p.id === preferred ? `${p.id} — preferido` : p.id,
            provider: p
        })),
        { placeHolder: 'Qual provedor de IA você quer configurar?' }
    );
    if (!picked) {
        return;
    }

    const provider = picked.provider;
    const existing = await context.secrets.get(SECRET_KEYS[provider.id]);
    const key = await vscode.window.showInputBox({
        prompt: `API key da ${provider.label} (${provider.keyHint})`,
        password: true,
        ignoreFocusOut: true,
        value: existing ? '' : undefined,
        placeHolder: existing ? 'Já configurada — digite uma nova para substituir, ou Esc para manter' : undefined,
        validateInput: (v) => (v && !provider.validate(v) ? `Formato inesperado — esperado algo como ${provider.keyHint}` : null)
    });

    if (key) {
        await context.secrets.store(SECRET_KEYS[provider.id], key);
        vscode.window.showInformationMessage(
            `Synesis: API key da ${provider.label} salva com segurança. O modelo já aparece no seletor de chat.`
        );
    }
}

/** Comando "Synesis: Remover API Key de Provedor" — limpeza explícita, útil após rotação de chave. */
async function removeProviderKeyCommand(context) {
    const picked = await vscode.window.showQuickPick(
        PROVIDERS.map((p) => ({ label: p.label, description: p.id, provider: p })),
        { placeHolder: 'Remover a API key de qual provedor?' }
    );
    if (!picked) {
        return;
    }
    await context.secrets.delete(SECRET_KEYS[picked.provider.id]);
    vscode.window.showInformationMessage(`Synesis: API key da ${picked.provider.label} removida.`);
}

module.exports = {
    registerAllProviders,
    configureProviderCommand,
    removeProviderKeyCommand,
    readPreferredProviderId,
    PROVIDERS,
    SECRET_KEYS
};
