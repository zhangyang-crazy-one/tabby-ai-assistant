import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FileStorageService } from '../../services/core/file-storage.service';
import { Memory } from '../../services/context/memory';
import { ChatHistoryService } from '../../services/chat/chat-history.service';
import { CheckpointManager } from '../../services/core/checkpoint.service';
import { ConfigProviderService } from '../../services/core/config-provider.service';
import { ConsentManagerService } from '../../services/security/consent-manager.service';
import { LoggerService } from '../../services/core/logger.service';
import { ToastService } from '../../services/core/toast.service';
import { TranslateService } from '../../i18n';

/**
 * 数据文件信息
 */
export interface DataFileInfo {
    name: string;
    size: number;
    modified: Date;
}

/**
 * 数据管理设置组件
 * 提供数据存储位置查看、导出、导入和清除功能
 */
@Component({
    selector: 'app-data-settings',
    template: `
        <div class="data-settings">
            <div class="section-header">
                <i class="fa fa-database"></i>
                <h3>{{ t?.dataSettings?.title || '数据管理' }}</h3>
            </div>
            <p class="description">{{ t?.dataSettings?.description || '管理插件的数据存储，包括聊天记录、记忆和配置' }}</p>

            <!-- 数据位置卡片 -->
            <div class="location-card">
                <div class="card-icon">
                    <i class="fa fa-hdd-o"></i>
                </div>
                <div class="card-content">
                    <div class="card-title">{{ t?.dataSettings?.storageLocation || '存储位置' }}</div>
                    <div class="card-value">
                        <code>{{ dataDirectory }}</code>
                    </div>
                </div>
                <button class="btn btn-outline" (click)="openDataDirectory()">
                    <i class="fa fa-folder-open"></i>
                    {{ t?.dataSettings?.openDirectory || '打开目录' }}
                </button>
            </div>

            <!-- 数据统计区域 -->
            <div class="stats-section">
                <h4 class="section-subtitle">
                    <i class="fa fa-chart-bar"></i>
                    {{ t?.dataSettings?.statistics || '数据统计' }}
                </h4>
                <div class="stats-grid">
                    <div class="stat-card" (click)="showFileType('sessions')">
                        <div class="stat-icon sessions">
                            <i class="fa fa-comments"></i>
                        </div>
                        <div class="stat-details">
                            <span class="stat-number">{{ statistics.totalSessions }}</span>
                            <span class="stat-text">{{ t?.dataSettings?.chatSessions || '聊天会话' }}</span>
                        </div>
                    </div>
                    <div class="stat-card" (click)="showFileType('memories')">
                        <div class="stat-icon memories">
                            <i class="fa fa-brain"></i>
                        </div>
                        <div class="stat-details">
                            <span class="stat-number">{{ statistics.totalMemories }}</span>
                            <span class="stat-text">{{ t?.dataSettings?.memoryItems || '记忆项' }}</span>
                        </div>
                    </div>
                    <div class="stat-card" (click)="showFileType('checkpoints')">
                        <div class="stat-icon checkpoints">
                            <i class="fa fa-save"></i>
                        </div>
                        <div class="stat-details">
                            <span class="stat-number">{{ statistics.totalCheckpoints }}</span>
                            <span class="stat-text">{{ t?.dataSettings?.checkpoints || '检查点' }}</span>
                        </div>
                    </div>
                    <div class="stat-card" (click)="showFileType('consents')">
                        <div class="stat-icon consents">
                            <i class="fa fa-shield-alt"></i>
                        </div>
                        <div class="stat-details">
                            <span class="stat-number">{{ statistics.totalConsents }}</span>
                            <span class="stat-text">{{ t?.dataSettings?.consents || '授权记录' }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 存储文件列表 -->
            <div class="files-section">
                <div class="section-header-inline">
                    <h4 class="section-subtitle">
                        <i class="fa fa-file-alt"></i>
                        {{ t?.dataSettings?.storedFiles || '存储文件' }}
                    </h4>
                    <div class="files-actions">
                        <button class="btn-action" (click)="exportAllData()" title="{{ t?.dataSettings?.exportAll || '导出所有' }}">
                            <i class="fa fa-file-export"></i>
                            <span>{{ t?.dataSettings?.exportAll || '导出所有' }}</span>
                        </button>
                        <button class="btn-action" (click)="importData()" title="{{ t?.dataSettings?.importData || '导入数据' }}">
                            <i class="fa fa-file-import"></i>
                            <span>{{ t?.dataSettings?.importData || '导入' }}</span>
                        </button>
                        <button class="btn-action" (click)="migrateFromLocalStorage()" title="{{ t?.dataSettings?.migrateData || '迁移数据' }}">
                            <i class="fa fa-sync"></i>
                            <span>{{ t?.dataSettings?.migrateData || '迁移' }}</span>
                        </button>
                        <button class="btn-action danger" (click)="clearAllData()" title="{{ t?.dataSettings?.clearAll || '清除所有' }}">
                            <i class="fa fa-trash-alt"></i>
                            <span>{{ t?.dataSettings?.clearAll || '清除' }}</span>
                        </button>
                    </div>
                </div>

                <div class="files-table-container" *ngIf="dataFiles.length > 0">
                    <table class="files-table">
                        <thead>
                            <tr>
                                <th class="col-name">
                                    <i class="fa fa-file-code"></i>
                                    {{ t?.dataSettings?.fileName || '文件名' }}
                                </th>
                                <th class="col-size">
                                    <i class="fa fa-expand"></i>
                                    {{ t?.dataSettings?.size || '大小' }}
                                </th>
                                <th class="col-date">
                                    <i class="fa fa-calendar-alt"></i>
                                    {{ t?.dataSettings?.lastModified || '修改时间' }}
                                </th>
                                <th class="col-actions">
                                    <i class="fa fa-cog"></i>
                                    {{ t?.dataSettings?.actions || '操作' }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr *ngFor="let file of dataFiles; let i = index" [class.row-animate]="true" [style.animation-delay]="i * 50 + 'ms'">
                                <td class="cell-name">
                                    <i class="fa fa-file-alt file-icon"></i>
                                    <span class="file-name">{{ file.name }}</span>
                                </td>
                                <td class="cell-size">
                                    <span class="size-badge">{{ formatFileSize(file.size) }}</span>
                                </td>
                                <td class="cell-date">
                                    <span class="date-text">{{ file.modified | date:'yyyy-MM-dd HH:mm' }}</span>
                                </td>
                                <td class="cell-actions">
                                    <button class="btn-action-sm" (click)="viewFile(file)" title="{{ t?.common?.view || '查看' }}">
                                        <i class="fa fa-eye"></i>
                                    </button>
                                    <button class="btn-action-sm danger" (click)="deleteFile(file)" title="{{ t?.common?.delete || '删除' }}">
                                        <i class="fa fa-trash-alt"></i>
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="empty-state" *ngIf="dataFiles.length === 0">
                    <div class="empty-icon">
                        <i class="fa fa-folder-open"></i>
                    </div>
                    <p class="empty-text">{{ t?.dataSettings?.noFiles || '暂无数据文件' }}</p>
                    <p class="empty-hint">导入数据或迁移浏览器存储后即可在此查看</p>
                </div>
            </div>

            <!-- 数据迁移提示 -->
            <div class="migration-alert" *ngIf="needsMigration">
                <div class="alert-icon">
                    <i class="fa fa-exclamation-triangle"></i>
                </div>
                <div class="alert-content">
                    <p class="alert-title">检测到旧数据</p>
                    <p class="alert-text">{{ t?.dataSettings?.migrationNote || '浏览器存储中还有旧数据，建议点击"迁移"将数据迁移到文件存储' }}</p>
                </div>
                <button class="btn btn-warning" (click)="migrateFromLocalStorage()">
                    <i class="fa fa-sync"></i>
                    {{ t?.dataSettings?.migrateData || '立即迁移' }}
                </button>
            </div>
        </div>
    `,
    styles: [`
        /* 基础布局 */
        .data-settings {
            padding: 0;
            max-width: 100%;
        }

        /* 标题区域 */
        .section-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--ai-border);
        }

        .section-header i {
            font-size: 1.4rem;
            color: var(--ai-primary);
        }

        .section-header h3 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--ai-text-primary);
        }

        .description {
            color: var(--ai-text-secondary);
            margin: 0 0 20px 0;
            font-size: 0.9rem;
            line-height: 1.5;
        }

        /* 位置卡片 */
        .location-card {
            display: flex;
            align-items: center;
            gap: 16px;
            background: linear-gradient(135deg, var(--ai-bg-secondary) 0%, var(--ai-bg-tertiary) 100%);
            padding: 16px 20px;
            border-radius: 12px;
            margin-bottom: 24px;
            border: 1px solid var(--ai-border);
            transition: all 0.3s ease;
        }

        .location-card:hover {
            border-color: var(--ai-primary);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .card-icon {
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(74, 158, 255, 0.15);
            border-radius: 12px;
            font-size: 1.3rem;
            color: #4a9eff;
        }

        .card-content {
            flex: 1;
            min-width: 0;
        }

        .card-title {
            font-size: 0.8rem;
            color: var(--ai-text-secondary);
            margin-bottom: 4px;
        }

        .card-value {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .card-value code {
            font-family: 'SF Mono', 'Consolas', monospace;
            font-size: 0.85rem;
            color: var(--ai-text-primary);
            background: var(--ai-bg-primary);
            padding: 4px 8px;
            border-radius: 4px;
        }

        /* 统计区域 */
        .stats-section {
            margin-bottom: 24px;
        }

        .section-subtitle {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0 0 12px 0;
            font-size: 0.95rem;
            font-weight: 500;
            color: var(--ai-text-primary);
        }

        .section-subtitle i {
            color: var(--ai-primary);
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
        }

        .stat-card {
            display: flex;
            align-items: center;
            gap: 12px;
            background: var(--ai-bg-secondary);
            padding: 16px;
            border-radius: 10px;
            border: 1px solid var(--ai-border);
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .stat-card:hover {
            transform: translateY(-2px);
            border-color: var(--ai-primary);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
        }

        .stat-icon {
            width: 44px;
            height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
            font-size: 1.1rem;
        }

        .stat-icon.sessions {
            background: linear-gradient(135deg, rgba(74, 158, 255, 0.2) 0%, rgba(74, 158, 255, 0.1) 100%);
            color: #4a9eff;
        }

        .stat-icon.memories {
            background: linear-gradient(135deg, rgba(192, 132, 252, 0.2) 0%, rgba(192, 132, 252, 0.1) 100%);
            color: #c084fc;
        }

        .stat-icon.checkpoints {
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%);
            color: #10b981;
        }

        .stat-icon.consents {
            background: linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(251, 191, 36, 0.1) 100%);
            color: #fbbf24;
        }

        .stat-details {
            display: flex;
            flex-direction: column;
        }

        .stat-number {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--ai-text-primary);
            line-height: 1.2;
        }

        .stat-text {
            font-size: 0.75rem;
            color: var(--ai-text-secondary);
        }

        /* 文件区域 */
        .files-section {
            background: var(--ai-bg-secondary);
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid var(--ai-border);
            margin-bottom: 20px;
        }

        .section-header-inline {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 16px;
            background: var(--ai-bg-tertiary);
            border-bottom: 1px solid var(--ai-border);
        }

        .section-header-inline .section-subtitle {
            margin: 0;
        }

        .files-actions {
            display: flex;
            gap: 8px;
        }

        .btn-action {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: var(--ai-bg-secondary);
            border: 1px solid var(--ai-border);
            border-radius: 6px;
            color: var(--ai-text-secondary);
            font-size: 0.8rem;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-action i {
            font-size: 0.9rem;
        }

        .btn-action:hover {
            background: var(--ai-primary);
            border-color: var(--ai-primary);
            color: white;
        }

        .btn-action.danger:hover {
            background: #ef4444;
            border-color: #ef4444;
        }

        /* 文件表格 */
        .files-table-container {
            overflow-x: auto;
        }

        .files-table {
            width: 100%;
            border-collapse: collapse;
            min-width: 600px;
        }

        .files-table th {
            padding: 12px 16px;
            text-align: left;
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--ai-text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            background: var(--ai-bg-tertiary);
            border-bottom: 1px solid var(--ai-border);
        }

        .files-table th i {
            margin-right: 6px;
            font-size: 0.85rem;
            color: var(--ai-primary);
        }

        .files-table td {
            padding: 12px 16px;
            font-size: 0.875rem;
            color: var(--ai-text-primary);
            border-bottom: 1px solid var(--ai-border);
            vertical-align: middle;
        }

        .files-table tbody tr {
            transition: background 0.2s ease;
        }

        .files-table tbody tr:hover {
            background: rgba(74, 158, 255, 0.05);
        }

        .files-table tbody tr:last-child td {
            border-bottom: none;
        }

        .cell-name {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .file-icon {
            color: var(--ai-primary);
            font-size: 1rem;
        }

        .file-name {
            font-family: 'SF Mono', 'Consolas', monospace;
            font-size: 0.85rem;
        }

        .size-badge {
            display: inline-block;
            padding: 2px 8px;
            background: var(--ai-bg-tertiary);
            border-radius: 4px;
            font-size: 0.8rem;
            color: var(--ai-text-secondary);
        }

        .date-text {
            font-size: 0.85rem;
            color: var(--ai-text-secondary);
        }

        .cell-actions {
            display: flex;
            gap: 6px;
        }

        .btn-action-sm {
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: 1px solid var(--ai-border);
            border-radius: 6px;
            color: var(--ai-text-secondary);
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-action-sm:hover {
            background: var(--ai-primary);
            border-color: var(--ai-primary);
            color: white;
        }

        .btn-action-sm.danger:hover {
            background: #ef4444;
            border-color: #ef4444;
        }

        /* 空状态 */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 48px 24px;
            text-align: center;
        }

        .empty-icon {
            width: 64px;
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--ai-bg-tertiary);
            border-radius: 50%;
            margin-bottom: 16px;
            font-size: 1.5rem;
            color: var(--ai-text-secondary);
            opacity: 0.6;
        }

        .empty-text {
            margin: 0 0 8px 0;
            font-size: 1rem;
            color: var(--ai-text-primary);
        }

        .empty-hint {
            margin: 0;
            font-size: 0.85rem;
            color: var(--ai-text-secondary);
        }

        /* 迁移提示 */
        .migration-alert {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px;
            background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%);
            border: 1px solid rgba(245, 158, 11, 0.3);
            border-radius: 10px;
            margin-top: 20px;
        }

        .alert-icon {
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(245, 158, 11, 0.2);
            border-radius: 10px;
            font-size: 1.2rem;
            color: #f59e0b;
        }

        .alert-content {
            flex: 1;
        }

        .alert-title {
            margin: 0 0 4px 0;
            font-weight: 600;
            color: #f59e0b;
        }

        .alert-text {
            margin: 0;
            font-size: 0.85rem;
            color: var(--ai-text-secondary);
        }

        /* 按钮样式 */
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 0.85rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn i {
            font-size: 0.9rem;
        }

        .btn-outline {
            background: transparent;
            border: 1px solid var(--ai-border);
            color: var(--ai-text-primary);
        }

        .btn-outline:hover {
            background: var(--ai-primary);
            border-color: var(--ai-primary);
            color: white;
        }

        .btn-warning {
            background: #f59e0b;
            color: white;
        }

        .btn-warning:hover {
            background: #d97706;
        }

        /* 响应式 */
        @media (max-width: 900px) {
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }

            .location-card {
                flex-wrap: wrap;
            }

            .location-card .btn {
                width: 100%;
                justify-content: center;
                margin-top: 12px;
            }
        }

        @media (max-width: 600px) {
            .stats-grid {
                grid-template-columns: 1fr;
            }

            .section-header-inline {
                flex-direction: column;
                align-items: flex-start;
                gap: 12px;
            }

            .files-actions {
                width: 100%;
                flex-wrap: wrap;
            }

            .btn-action span {
                display: none;
            }

            .btn-action {
                padding: 8px;
            }
        }

        /* 动画 */
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .row-animate {
            animation: fadeInUp 0.3s ease forwards;
            opacity: 0;
        }
    `],
    encapsulation: ViewEncapsulation.None
})
export class DataSettingsComponent implements OnInit, OnDestroy {
    private destroy$ = new Subject<void>();

    /** 数据目录路径 */
    dataDirectory = '';

    /** 数据文件列表 */
    dataFiles: DataFileInfo[] = [];

    /** 数据统计 */
    statistics = {
        totalSessions: 0,
        totalMemories: 0,
        totalCheckpoints: 0,
        totalConsents: 0
    };

    /** 是否需要从 localStorage 迁移 */
    needsMigration = false;

    constructor(
        private fileStorage: FileStorageService,
        private memory: Memory,
        private chatHistoryService: ChatHistoryService,
        private checkpointManager: CheckpointManager,
        private configProvider: ConfigProviderService,
        private consentManager: ConsentManagerService,
        private logger: LoggerService,
        private toast: ToastService
    ) {}

    ngOnInit(): void {
        this.loadDataDirectory();
        this.loadDataFiles();
        this.loadStatistics();
        this.checkMigrationStatus();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * 加载数据目录路径
     */
    private loadDataDirectory(): void {
        this.dataDirectory = this.fileStorage.getDataDirectory();
    }

    /**
     * 加载数据文件列表
     */
    private loadDataFiles(): void {
        this.dataFiles = this.fileStorage.listFilesWithInfo();
    }

    /**
     * 加载数据统计
     */
    private loadStatistics(): void {
        // 聊天会话统计
        const chatStats = this.chatHistoryService.getStatistics();
        this.statistics.totalSessions = chatStats.totalSessions;

        // 记忆统计
        const memoryStats = this.memory.getStatistics();
        this.statistics.totalMemories = memoryStats.totalItems;

        // 检查点统计
        const checkpointStats = this.checkpointManager.getStatistics();
        this.statistics.totalCheckpoints = checkpointStats.totalCheckpoints;
    }

    /**
     * 检查是否需要从 localStorage 迁移
     */
    private checkMigrationStatus(): void {
        // 检查 localStorage 中是否还有旧数据
        const keys = Object.keys(localStorage);
        const hasOldData = keys.some(key =>
            key.startsWith('tabby-ai-assistant-') ||
            key.startsWith('ai-assistant-') ||
            key.startsWith('checkpoint_')
        );
        this.needsMigration = hasOldData;
    }

    /**
     * 打开数据目录
     */
    openDataDirectory(): void {
        try {
            const fs = (window as any).require?.('fs');
            if (fs) {
                const { shell } = (window as any).require('electron');
                shell.openPath(this.dataDirectory);
            } else {
                this.toast.warning('无法打开目录，请在文件管理器中手动打开: ' + this.dataDirectory);
            }
        } catch (error) {
            this.logger.error('Failed to open data directory', error);
            this.toast.error('打开目录失败');
        }
    }

    /**
     * 查看文件内容
     */
    viewFile(file: DataFileInfo): void {
        try {
            const content = this.fileStorage.load(file.name, null);
            if (content) {
                const jsonContent = JSON.stringify(content, null, 2);
                // 在新窗口中显示内容
                this.showFileContent(file.name, jsonContent);
            }
        } catch (error) {
            this.logger.error('Failed to view file', { file: file.name, error });
            this.toast.error('查看文件失败');
        }
    }

    /**
     * 显示文件内容
     */
    private showFileContent(filename: string, content: string): void {
        // 创建一个临时的内容显示
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        this.toast.success(`已下载文件: ${filename}`);
    }

    /**
     * 删除文件
     */
    deleteFile(file: DataFileInfo): void {
        if (confirm(`确定要删除 ${file.name} 吗？此操作不可恢复。`)) {
            const deleted = this.fileStorage.delete(file.name);
            if (deleted) {
                this.loadDataFiles();
                this.loadStatistics();
                this.toast.success('文件已删除');
                this.logger.info('Data file deleted', { filename: file.name });
            } else {
                this.toast.error('删除文件失败');
            }
        }
    }

    /**
     * 导出所有数据
     */
    exportAllData(): void {
        try {
            const exportData = this.fileStorage.exportAll();
            const blob = new Blob([exportData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tabby-ai-assistant-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this.toast.success('数据导出成功');
            this.logger.info('All data exported');
        } catch (error) {
            this.logger.error('Failed to export data', error);
            this.toast.error('导出数据失败');
        }
    }

    /**
     * 导入数据
     */
    importData(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (event: any) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e: any) => {
                    try {
                        const result = this.fileStorage.importAll(e.target.result);
                        if (result.success) {
                            this.loadDataFiles();
                            this.loadStatistics();
                            this.toast.success(`成功导入 ${result.imported.length} 个文件`);
                            this.logger.info('Data imported', { imported: result.imported });
                        } else {
                            this.toast.error('导入失败: ' + result.errors.join(', '));
                        }
                    } catch (error) {
                        this.logger.error('Failed to import data', error);
                        this.toast.error('导入数据失败');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    /**
     * 从 localStorage 迁移数据
     */
    migrateFromLocalStorage(): void {
        if (confirm('确定要从浏览器存储迁移数据到文件存储吗？此操作不会删除原有数据。')) {
            try {
                const migratedFiles = this.fileStorage.migrateFromLocalStorage();
                if (migratedFiles.length > 0) {
                    this.loadDataFiles();
                    this.loadStatistics();
                    this.needsMigration = false;
                    this.toast.success(`成功迁移 ${migratedFiles.length} 个文件`);
                    this.logger.info('Data migrated from localStorage', { files: migratedFiles });
                } else {
                    this.toast.info('没有需要迁移的数据');
                }
            } catch (error) {
                this.logger.error('Failed to migrate data', error);
                this.toast.error('迁移数据失败');
            }
        }
    }

    /**
     * 清除所有数据
     */
    clearAllData(): void {
        if (confirm('确定要清除所有数据吗？此操作不可恢复！')) {
            if (confirm('再次确认：清除后将丢失所有聊天记录、记忆和配置。')) {
                try {
                    const clearedCount = this.fileStorage.clearAll();
                    this.loadDataFiles();
                    this.loadStatistics();
                    this.toast.success(`已清除 ${clearedCount} 个数据文件`);
                    this.logger.info('All data cleared', { count: clearedCount });
                } catch (error) {
                    this.logger.error('Failed to clear data', error);
                    this.toast.error('清除数据失败');
                }
            }
        }
    }

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 显示指定类型的数据文件
     * 点击统计卡片时调用，用于筛选显示对应的文件
     */
    showFileType(type: string): void {
        // 目前仅作为交互反馈，后续可扩展筛选功能
        this.logger.debug('Show file type', { type });
    }
}
