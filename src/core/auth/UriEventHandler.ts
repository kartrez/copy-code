import * as vscode from 'vscode';
import * as querystring from 'querystring';

export class UriEventHandler implements vscode.UriHandler {
    private readonly _onDidReceiveUri = new vscode.EventEmitter<vscode.Uri>();

    constructor(private readonly context: vscode.ExtensionContext) {}

    async handleUri(uri: vscode.Uri) {
        this._onDidReceiveUri.fire(uri);

        if (uri.path === '/loginhook') {
            const query = querystring.parse(uri.query);
            const encodedToken = query['token'];

            if (typeof encodedToken !== 'string') {
                vscode.window.showErrorMessage('Токен не найден в запросе.');
                return;
            }

            try {
                const token = decodeURIComponent(encodedToken); // Раскодируем токен

                // Сохраняем токен в хранилище секретов
                await this.context.secrets.store('gptChatByApiKey', token);

                // Вызываем обработчик в ClineProvider
                const { ClineProvider } = await import('../webview/ClineProvider');
                const instance = ClineProvider.getVisibleInstance();
                if (instance) {
                    await instance.handleLoginCallback(token);
                } else {
                    // Уведомляем пользователя если инстанс не найден (хотя бы так)
                    vscode.window.showInformationMessage('Вы успешно вошли в систему!');
                }

            } catch (error) {
                console.error('Ошибка обработки токена:', error);
                vscode.window.showErrorMessage('Ошибка при обработке токена.');
            }
        } else {
            vscode.window.showWarningMessage(`Неизвестный путь: ${uri.path}`);
        }
    }
}