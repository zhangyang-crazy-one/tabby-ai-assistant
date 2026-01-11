import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
    MCPServerConfig,
    MCPServerWithStatus,
    MCPServerStatus,
    MCPTransportType
} from '../../services/mcp/mcp-message.types';
import { MCPClientManager } from '../../services/mcp/mcp-client-manager.service';
import { LoggerService } from '../../services/core/logger.service';
import { ToastService } from '../../services/core/toast.service';
import { TranslateService } from '../../i18n';

/**
 * 服务器编辑器模式
 */
type EditorMode = 'add' | 'edit' | null;

/**
 * MCP 设置组件
 * 提供 MCP 服务器的配置和管理界面
 */
@Component({
    selector: 'app-mcp-settings',
    template: `
        <div class="mcp-settings">
            <h3>{{ t.mcpSettings?.title || 'MCP 服务器' }}</h3>
            <p class="description">{{ t.mcpSettings?.description || '配置 MCP 服务器以扩展 AI 助手的功能' }}</p>

            <!-- 服务器列表 -->
            <div class="server-list" *ngIf="servers.length > 0">
                <div *ngFor="let server of servers" class="server-item"
                     [class.connected]="server.status === 'connected'"
                     [class.connecting]="server.status === 'connecting'"
                     [class.error]="server.status === 'error'">
                    <div class="server-header">
                        <div class="server-info">
                            <span class="status-indicator" [class]="server.status"></span>
                            <span class="server-name">{{ server.name }}</span>
                            <span class="transport-badge">{{ getTransportLabel(server.transport) }}</span>
                        </div>
                        <div class="server-meta">
                            <span class="tool-count" *ngIf="server.toolCount > 0">
                                {{ server.toolCount }} {{ t.mcpSettings?.toolsAvailable || '工具' }}
                            </span>
                        </div>
                    </div>

                    <div class="server-config" *ngIf="server.transport === 'stdio'">
                        <code>{{ server.command }} {{ server.args?.join(' ') }}</code>
                    </div>
                    <div class="server-config" *ngIf="server.transport !== 'stdio'">
                        <code>{{ server.url }}</code>
                    </div>

                    <div class="error-message" *ngIf="server.error">
                        {{ server.error }}
                    </div>

                    <div class="server-actions">
                        <button class="btn btn-sm"
                                [class.btn-success]="server.status !== 'connected'"
                                [class.btn-danger]="server.status === 'connected'"
                                (click)="toggleConnection(server)">
                            {{ getConnectionButtonText(server.status) }}
                        </button>
                        <button class="btn btn-sm btn-secondary" (click)="editServer(server)">
                            {{ t.common?.edit || '编辑' }}
                        </button>
                        <button class="btn btn-sm btn-danger" (click)="deleteServer(server)">
                            {{ t.common?.delete || '删除' }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- 空状态 -->
            <div class="empty-state" *ngIf="servers.length === 0">
                <div class="empty-icon">🔌</div>
                <p>{{ t.mcpSettings?.noServers || '暂无配置的 MCP 服务器' }}</p>
                <p class="hint">{{ t.mcpSettings?.addServerHint || '添加一个 MCP 服务器来扩展 AI 功能' }}</p>
            </div>

            <!-- 添加服务器按钮 -->
            <div class="add-server-section">
                <button class="btn btn-primary add-server-btn" (click)="showEditor('add')">
                    <span class="icon">+</span>
                    {{ t.mcpSettings?.addServer || '添加 MCP 服务器' }}
                </button>
                <button class="btn btn-secondary import-btn" (click)="showImportDialog()">
                    <span class="icon">📥</span>
                    {{ t.mcpSettings?.importJson || '导入 JSON 配置' }}
                </button>
            </div>

            <!-- JSON 导入对话框 -->
            <div class="modal-overlay" *ngIf="showImport" (click)="hideImportDialog()">
                <div class="modal-content" (click)="$event.stopPropagation()">
                    <div class="modal-header">
                        <h4>{{ t.mcpSettings?.importJson || '导入 JSON 配置' }}</h4>
                        <button class="close-btn" (click)="hideImportDialog()">×</button>
                    </div>
                    <div class="modal-body">
                        <p class="import-hint">{{ t.mcpSettings?.importHint || '粘贴 Claude Desktop 格式的 MCP 配置:' }}</p>
                        <textarea class="form-control json-input" rows="12"
                                  [(ngModel)]="importJsonText"
                                  [placeholder]="getImportPlaceholder()"></textarea>
                        <div class="import-example">
                            <strong>{{ t.mcpSettings?.exampleFormat || '示例格式：' }}</strong>
                            <pre>{{ getExampleJson() }}</pre>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" (click)="hideImportDialog()">
                            {{ t.common?.cancel || '取消' }}
                        </button>
                        <button class="btn btn-primary" (click)="importFromJson()" [disabled]="!importJsonText">
                            {{ t.mcpSettings?.import || '导入' }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- 服务器编辑器（模态框） -->
            <div class="modal-overlay" *ngIf="editorMode" (click)="hideEditor()">
                <div class="modal-content" (click)="$event.stopPropagation()">
                    <div class="modal-header">
                        <h4>{{ editorMode === 'add' ? (t.mcpSettings?.addServer || '添加服务器') : (t.mcpSettings?.editServer || '编辑服务器') }}</h4>
                        <button class="close-btn" (click)="hideEditor()">×</button>
                    </div>

                    <div class="modal-body">
                        <!-- 基本信息 -->
                        <div class="form-group">
                            <label>{{ t.mcpSettings?.serverName || '服务器名称' }} *</label>
                            <input type="text" class="form-control"
                                   [(ngModel)]="editingServer.name"
                                   [placeholder]="t.mcpSettings?.serverNamePlaceholder || '例如：文件系统服务器'">
                        </div>

                        <!-- 传输类型 -->
                        <div class="form-group">
                            <label>{{ t.mcpSettings?.transportType || '传输类型' }} *</label>
                            <select class="form-control" [(ngModel)]="editingServer.transport">
                                <option value="stdio">{{ t.mcpSettings?.transportStdio || '本地进程 (stdio)' }}</option>
                                <option value="sse">{{ t.mcpSettings?.transportSSE || 'Server-Sent Events (SSE)' }}</option>
                                <option value="streamable-http">{{ t.mcpSettings?.transportHTTP || 'Streamable HTTP' }}</option>
                            </select>
                        </div>

                        <!-- Stdio 配置 -->
                        <div *ngIf="editingServer.transport === 'stdio'" class="transport-config">
                            <div class="form-group">
                                <label>{{ t.mcpSettings?.command || '命令' }} *</label>
                                <input type="text" class="form-control"
                                       [(ngModel)]="editingServer.command"
                                       [placeholder]="t.mcpSettings?.commandPlaceholder || '例如：npx'">
                            </div>

                            <div class="form-group">
                                <label>{{ t.mcpSettings?.args || '参数' }}</label>
                                <input type="text" class="form-control"
                                       [value]="editingServer.args?.join(' ') || ''"
                                       (input)="updateArgs($event)"
                                       [placeholder]="t.mcpSettings?.argsPlaceholder || '例如：-y @modelcontextprotocol/server-filesystem'">
                                <small class="form-hint">{{ t.mcpSettings?.argsHint || '用空格分隔参数' }}</small>
                            </div>

                            <div class="form-group">
                                <label>{{ t.mcpSettings?.workingDir || '工作目录' }}</label>
                                <input type="text" class="form-control"
                                       [(ngModel)]="editingServer.cwd"
                                       [placeholder]="t.mcpSettings?.workingDirPlaceholder || '可选'">
                            </div>

                            <div class="form-group">
                                <label>{{ t.mcpSettings?.envVars || '环境变量' }}</label>
                                <textarea class="form-control" rows="3"
                                          [value]="formatEnvVars(editingServer.env)"
                                          (input)="updateEnvVars($event)"
                                          [placeholder]="t.mcpSettings?.envVarsPlaceholder || 'KEY=value\n每行一个'"></textarea>
                            </div>
                        </div>

                        <!-- HTTP/SSE 配置 -->
                        <div *ngIf="editingServer.transport !== 'stdio'" class="transport-config">
                            <div class="form-group">
                                <label>{{ t.mcpSettings?.serverURL || '服务器 URL' }} *</label>
                                <input type="url" class="form-control"
                                       [(ngModel)]="editingServer.url"
                                       [placeholder]="t.mcpSettings?.urlPlaceholder || '例如：http://localhost:3000'">
                            </div>

                            <div class="form-group">
                                <label>{{ t.mcpSettings?.headers || '请求头' }}</label>
                                <textarea class="form-control" rows="3"
                                          [value]="formatEnvVars(editingServer.headers)"
                                          (input)="updateHeaders($event)"
                                          [placeholder]="t.mcpSettings?.headersPlaceholder || 'Header-Name: value\n每行一个'"></textarea>
                            </div>
                        </div>

                        <!-- 启用开关 -->
                        <div class="form-group checkbox-group">
                            <label>
                                <input type="checkbox" [(ngModel)]="editingServer.enabled">
                                {{ t.mcpSettings?.autoConnect || '自动连接' }}
                            </label>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button class="btn btn-secondary" (click)="hideEditor()">
                            {{ t.common?.cancel || '取消' }}
                        </button>
                        <button class="btn btn-primary" (click)="saveServer()" [disabled]="!isValidServer()">
                            {{ t.common?.save || '保存' }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- 帮助信息 -->
            <div class="help-section">
                <h4>{{ t.mcpSettings?.helpTitle || '常用 MCP 服务器' }}</h4>
                <ul class="help-list">
                    <li>
                        <strong>Filesystem</strong>:
                        <code>npx -y @modelcontextprotocol/server-filesystem /path/to/dir</code>
                    </li>
                    <li>
                        <strong>Git</strong>:
                        <code>npx -y @modelcontextprotocol/server-github</code>
                    </li>
                    <li>
                        <strong>Database</strong>:
                        <code>npx -y @modelcontextprotocol/server-postgres postgresql://...</code>
                    </li>
                </ul>
                <p class="help-link">
                    {{ t.mcpSettings?.moreServers || '更多 MCP 服务器请访问' }}
                    <a href="https://github.com/modelcontextprotocol/servers" target="_blank">
                        MCP Servers Repository
                    </a>
                </p>
            </div>
        </div>
    `,
    styles: [`
        .mcp-settings {
            padding: 20px;
        }

        .mcp-settings h3 {
            margin-bottom: 8px;
            color: var(--text-primary);
        }

        .description {
            color: var(--text-secondary);
            margin-bottom: 20px;
        }

        /* 服务器列表 */
        .server-list {
            margin-bottom: 20px;
        }

        .server-item {
            background: var(--background-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            transition: all 0.2s;
        }

        .server-item.connected {
            border-color: var(--ai-success);
        }

        .server-item.connecting {
            border-color: var(--ai-warning);
        }

        .server-item.error {
            border-color: var(--ai-danger);
        }

        .server-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .server-info {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .status-indicator {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--text-secondary);
        }

        .status-indicator.connected {
            background: var(--ai-success);
        }

        .status-indicator.connecting {
            background: var(--ai-warning);
            animation: pulse 1s infinite;
        }

        .status-indicator.error {
            background: var(--ai-danger);
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .server-name {
            font-weight: 600;
            color: var(--text-primary);
        }

        .transport-badge {
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 4px;
            background: var(--background-tertiary);
            color: var(--text-secondary);
        }

        .server-meta {
            font-size: 12px;
            color: var(--text-secondary);
        }

        .server-config {
            margin: 8px 0;
        }

        .server-config code {
            display: block;
            padding: 8px;
            background: var(--background-tertiary);
            border-radius: 4px;
            font-size: 12px;
            color: var(--text-primary);
            overflow-x: auto;
        }

        .error-message {
            padding: 8px;
            margin: 8px 0;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid var(--ai-danger);
            border-radius: 4px;
            color: var(--ai-danger);
            font-size: 12px;
        }

        .server-actions {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }

        /* 按钮样式 */
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
        }

        .btn-sm {
            padding: 6px 12px;
            font-size: 12px;
        }

        .btn-primary {
            background: var(--primary);
            color: white;
        }

        .btn-primary:hover:not(:disabled) {
            background: var(--primary-hover);
        }

        .btn-secondary {
            background: var(--background-tertiary);
            color: var(--text-primary);
        }

        .btn-secondary:hover {
            background: var(--border-color);
        }

        .btn-success {
            background: var(--ai-success);
            color: white;
        }

        .btn-danger {
            background: var(--ai-danger);
            color: white;
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* 空状态 */
        .empty-state {
            text-align: center;
            padding: 40px 20px;
            background: var(--background-secondary);
            border-radius: 8px;
        }

        .empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
        }

        .empty-state p {
            color: var(--text-secondary);
            margin: 0;
        }

        .empty-state .hint {
            font-size: 12px;
            margin-top: 8px;
        }

        /* 添加服务器按钮 */
        .add-server-section {
            margin-top: 20px;
            display: flex;
            gap: 12px;
        }

        .add-server-btn {
            flex: 1;
            justify-content: center;
            padding: 12px;
        }

        .import-btn {
            padding: 12px 16px;
        }

        .add-server-btn .icon,
        .import-btn .icon {
            font-size: 18px;
        }

        /* JSON 导入样式 */
        .json-input {
            font-family: monospace;
            font-size: 12px;
            resize: vertical;
        }

        .import-hint {
            margin-bottom: 12px;
            color: var(--text-secondary);
        }

        .import-example {
            margin-top: 16px;
            padding: 12px;
            background: var(--background-secondary);
            border-radius: 6px;
        }

        .import-example strong {
            display: block;
            margin-bottom: 8px;
            color: var(--text-primary);
        }

        .import-example pre {
            margin: 0;
            padding: 12px;
            background: var(--background-tertiary);
            border-radius: 4px;
            font-size: 11px;
            overflow-x: auto;
            color: var(--text-primary);
        }

        /* 模态框 */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .modal-content {
            background: var(--background-primary);
            border-radius: 12px;
            width: 90%;
            max-width: 600px;
            max-height: 90vh;
            overflow-y: auto;
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            border-bottom: 1px solid var(--border-color);
        }

        .modal-header h4 {
            margin: 0;
            color: var(--text-primary);
        }

        .close-btn {
            background: none;
            border: none;
            font-size: 24px;
            color: var(--text-secondary);
            cursor: pointer;
            line-height: 1;
        }

        .modal-body {
            padding: 20px;
        }

        .modal-footer {
            padding: 16px 20px;
            border-top: 1px solid var(--border-color);
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }

        /* 表单样式 */
        .form-group {
            margin-bottom: 16px;
        }

        .form-group label {
            display: block;
            font-weight: 500;
            margin-bottom: 6px;
            color: var(--text-primary);
        }

        .form-control {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--background-secondary);
            color: var(--text-primary);
            font-size: 14px;
        }

        .form-control:focus {
            outline: none;
            border-color: var(--primary);
        }

        .form-hint {
            font-size: 12px;
            color: var(--text-secondary);
            margin-top: 4px;
        }

        textarea.form-control {
            font-family: monospace;
            font-size: 12px;
        }

        .checkbox-group label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
        }

        .checkbox-group input[type="checkbox"] {
            width: 16px;
            height: 16px;
        }

        /* 帮助区域 */
        .help-section {
            margin-top: 30px;
            padding: 20px;
            background: var(--background-secondary);
            border-radius: 8px;
        }

        .help-section h4 {
            margin: 0 0 12px;
            color: var(--text-primary);
        }

        .help-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .help-list li {
            margin-bottom: 12px;
            font-size: 13px;
        }

        .help-list li strong {
            color: var(--text-primary);
        }

        .help-list code {
            display: block;
            padding: 8px;
            background: var(--background-tertiary);
            border-radius: 4px;
            font-size: 11px;
            overflow-x: auto;
            margin-top: 4px;
        }

        .help-link {
            margin-top: 16px;
            font-size: 13px;
            color: var(--text-secondary);
        }

        .help-link a {
            color: var(--primary);
            text-decoration: none;
        }

        .help-link a:hover {
            text-decoration: underline;
        }
    `]
})
export class MCPSettingsComponent implements OnInit, OnDestroy {
    private destroy$ = new Subject<void>();

    /** 服务器列表 */
    servers: MCPServerWithStatus[] = [];

    /** 编辑器模式 */
    editorMode: EditorMode = null;

    /** 当前编辑的服务器 */
    editingServer: MCPServerConfig = this.createEmptyServer();

    /** 是否显示导入对话框 */
    showImport = false;

    /** 导入的 JSON 文本 */
    importJsonText = '';

    /** 翻译对象 */
    t: any;

    constructor(
        private mcpManager: MCPClientManager,
        private logger: LoggerService,
        private toast: ToastService,
        private translate: TranslateService
    ) { }

    ngOnInit(): void {
        // 订阅翻译变化
        this.translate.translation$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(translation => {
            this.t = translation;
        });

        // 加载服务器列表
        this.loadServers();

        // 订阅状态变化
        this.mcpManager.onStatusChanged.pipe(
            takeUntil(this.destroy$)
        ).subscribe(() => {
            this.loadServers();
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * 加载服务器列表
     */
    loadServers(): void {
        this.servers = this.mcpManager.getAllServers();
    }

    /**
     * 显示编辑器
     */
    showEditor(mode: EditorMode, server?: MCPServerWithStatus): void {
        this.editorMode = mode;

        if (mode === 'edit' && server) {
            this.editingServer = {
                id: server.id,
                name: server.name,
                transport: server.transport,
                enabled: server.enabled,
                command: server.command,
                args: [...(server.args || [])],
                env: { ...(server.env || {}) },
                cwd: server.cwd,
                url: server.url,
                headers: { ...(server.headers || {}) }
            };
        } else {
            this.editingServer = this.createEmptyServer();
        }
    }

    /**
     * 隐藏编辑器
     */
    hideEditor(): void {
        this.editorMode = null;
        this.editingServer = this.createEmptyServer();
    }

    /**
     * 编辑服务器
     */
    editServer(server: MCPServerWithStatus): void {
        this.showEditor('edit', server);
    }

    /**
     * 保存服务器
     */
    async saveServer(): Promise<void> {
        if (!this.isValidServer()) {
            this.toast.error(this.t?.mcpSettings?.validationError || '请填写所有必填字段');
            return;
        }

        try {
            if (this.editorMode === 'add') {
                await this.mcpManager.addServer(this.editingServer);
            } else {
                await this.mcpManager.updateServer(this.editingServer);
            }

            this.toast.success(this.t?.common?.saveSuccess || '保存成功');
            this.hideEditor();
        } catch (error: any) {
            this.toast.error(error.message || (this.t?.common?.saveError || '保存失败'));
        }
    }

    /**
     * 删除服务器
     */
    async deleteServer(server: MCPServerWithStatus): Promise<void> {
        if (confirm((this.t?.mcpSettings?.deleteConfirm || '确定要删除服务器 "%s" 吗？').replace('%s', server.name))) {
            try {
                await this.mcpManager.deleteServer(server.id);
                this.toast.success(this.t?.common?.deleteSuccess || '删除成功');
            } catch (error: any) {
                this.toast.error(error.message || (this.t?.common?.deleteError || '删除失败'));
            }
        }
    }

    /**
     * 切换连接状态
     */
    async toggleConnection(server: MCPServerWithStatus): Promise<void> {
        try {
            if (server.status === 'connected') {
                await this.mcpManager.disconnect(server.id);
                this.toast.success(this.t?.mcpSettings?.disconnected || '已断开连接');
            } else if (server.status === 'disconnected' || server.status === 'error') {
                // 显示正在连接提示
                this.toast.info(this.t?.mcpSettings?.connecting || '正在连接...');

                // 重新加载配置并连接
                const fullServer = this.mcpManager.getServer(server.id);
                if (fullServer) {
                    await this.mcpManager.connect(fullServer);
                    // 连接成功的提示在 MCPClientManager.connect 中已处理
                } else {
                    this.toast.error(this.t?.mcpSettings?.serverNotFound || '服务器配置未找到');
                }
            }
            // 刷新服务器列表
            this.loadServers();
        } catch (error: any) {
            this.logger.error('Failed to toggle connection', { serverId: server.id, error });
            this.toast.error(error.message || (this.t?.mcpSettings?.connectionError || '连接失败'));
            this.loadServers();
        }
    }

    /**
     * 更新参数
     */
    updateArgs(event: any): void {
        const value = event.target.value.trim();
        this.editingServer.args = value ? value.split(/\s+/) : [];
    }

    /**
     * 更新环境变量
     */
    updateEnvVars(event: any): void {
        const value = event.target.value.trim();
        if (!value) {
            this.editingServer.env = {};
            return;
        }

        const env: Record<string, string> = {};
        for (const line of value.split('\n')) {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                env[key.trim()] = valueParts.join('=').trim();
            }
        }
        this.editingServer.env = env;
    }

    /**
     * 更新请求头
     */
    updateHeaders(event: any): void {
        const value = event.target.value.trim();
        if (!value) {
            this.editingServer.headers = {};
            return;
        }

        const headers: Record<string, string> = {};
        for (const line of value.split('\n')) {
            const [key, ...valueParts] = line.split(':');
            if (key && valueParts.length > 0) {
                headers[key.trim()] = valueParts.join(':').trim();
            }
        }
        this.editingServer.headers = headers;
    }

    /**
     * 格式化环境变量/请求头
     */
    formatEnvVars(obj?: Record<string, string>): string {
        if (!obj) return '';
        return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('\n');
    }

    /**
     * 获取传输类型标签
     */
    getTransportLabel(transport: MCPServerConfig['transport']): string {
        const labels: Record<string, string> = {
            'stdio': 'Stdio',
            'sse': 'SSE',
            'streamable-http': 'HTTP'
        };
        return labels[transport] || transport;
    }

    /**
     * 获取连接按钮文本
     */
    getConnectionButtonText(status: MCPServerStatus): string {
        const texts: Record<string, string> = {
            'connected': this.t?.mcpSettings?.disconnect || '断开',
            'connecting': this.t?.mcpSettings?.connecting || '连接中...',
            'error': this.t?.mcpSettings?.retry || '重试',
            'disconnected': this.t?.mcpSettings?.connect || '连接'
        };
        return texts[status] || texts.disconnected;
    }

    /**
     * 验证服务器配置
     */
    isValidServer(): boolean {
        if (!this.editingServer.name?.trim()) return false;
        if (!this.editingServer.transport) return false;

        if (this.editingServer.transport === 'stdio') {
            return !!this.editingServer.command?.trim();
        }

        return !!this.editingServer.url?.trim();
    }

    /**
     * 创建空服务器配置
     */
    private createEmptyServer(): MCPServerConfig {
        return {
            id: MCPClientManager.generateServerId(),
            name: '',
            transport: 'stdio',
            enabled: true,
            command: '',
            args: [],
            env: {},
            url: '',
            headers: {}
        };
    }

    /**
     * 显示导入对话框
     */
    showImportDialog(): void {
        this.showImport = true;
        this.importJsonText = '';
    }

    /**
     * 隐藏导入对话框
     */
    hideImportDialog(): void {
        this.showImport = false;
        this.importJsonText = '';
    }

    /**
     * 从 JSON 导入服务器配置
     */
    async importFromJson(): Promise<void> {
        if (!this.importJsonText.trim()) {
            this.toast.error(this.t?.mcpSettings?.emptyJson || '请输入 JSON 配置');
            return;
        }

        try {
            const json = JSON.parse(this.importJsonText);

            // 支持两种格式：
            // 1. Claude Desktop 格式: { "mcpServers": { "name": { ... } } }
            // 2. 直接服务器对象: { "name": { ... } }

            const serversObj = json.mcpServers || json;
            let importedCount = 0;

            for (const [name, config] of Object.entries(serversObj)) {
                const serverConfig = config as any;

                // 创建服务器配置
                const newServer: MCPServerConfig = {
                    id: MCPClientManager.generateServerId(),
                    name: name,
                    transport: 'stdio',
                    enabled: true,
                    command: serverConfig.command || '',
                    args: serverConfig.args || [],
                    env: serverConfig.env || {},
                    cwd: serverConfig.cwd
                };

                // 检测传输类型
                if (serverConfig.url) {
                    newServer.transport = serverConfig.url.includes('sse') ? 'sse' : 'streamable-http';
                    newServer.url = serverConfig.url;
                    newServer.headers = serverConfig.headers || {};
                }

                // 添加服务器
                await this.mcpManager.addServer(newServer);
                importedCount++;
            }

            this.toast.success(
                (this.t?.mcpSettings?.importSuccess || '成功导入 %d 个服务器').replace('%d', importedCount.toString())
            );
            this.hideImportDialog();
            this.loadServers();
        } catch (error: any) {
            this.logger.error('Failed to import JSON', error);
            this.toast.error(
                (this.t?.mcpSettings?.importError || '导入失败: %s').replace('%s', error.message)
            );
        }
    }

    /**
     * 获取导入占位符
     */
    getImportPlaceholder(): string {
        return `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    }
  }
}`;
    }

    /**
     * 获取示例 JSON
     */
    getExampleJson(): string {
        return JSON.stringify({
            "mcpServers": {
                "filesystem": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
                },
                "github": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-github"],
                    "env": { "GITHUB_TOKEN": "your-token" }
                }
            }
        }, null, 2);
    }
}
