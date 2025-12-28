import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface ToastMessage {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    duration?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
    private toastSubject = new Subject<ToastMessage>();
    toast$ = this.toastSubject.asObservable();

    show(type: ToastMessage['type'], message: string, duration = 3000): void {
        const id = `toast-${Date.now()}`;

        // 确保容器存在
        let container = document.getElementById('ai-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ai-toast-container';
            container.className = 'ai-toast-container';
            container.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 99999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }

        // 创建 Toast 元素
        const toast = document.createElement('div');
        toast.id = id;
        toast.className = `ai-toast ai-toast-${type}`;
        toast.style.cssText = `
            padding: 12px 16px;
            border-radius: 8px;
            color: white;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: toastSlideIn 0.3s ease;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            pointer-events: auto;
            min-width: 200px;
            max-width: 350px;
            ${type === 'success' ? 'background: linear-gradient(135deg, #22c55e, #16a34a);' : ''}
            ${type === 'error' ? 'background: linear-gradient(135deg, #ef4444, #dc2626);' : ''}
            ${type === 'warning' ? 'background: linear-gradient(135deg, #f59e0b, #d97706);' : ''}
            ${type === 'info' ? 'background: linear-gradient(135deg, #3b82f6, #2563eb);' : ''}
        `;

        const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ';
        toast.innerHTML = `<span style="font-size: 16px;">${icon}</span><span>${message}</span>`;

        toast.onclick = () => {
            this.removeToast(toast);
        };

        container.appendChild(toast);

        // 自动消失
        setTimeout(() => {
            this.removeToast(toast);
        }, duration);

        // 发射事件（兼容现有订阅）
        this.toastSubject.next({ id, type, message, duration });
    }

    private removeToast(toast: HTMLElement): void {
        if (toast && toast.parentNode) {
            toast.style.animation = 'toastSlideOut 0.3s ease forwards';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }
    }

    success(message: string, duration = 3000): void {
        this.show('success', message, duration);
    }

    error(message: string, duration = 5000): void {
        this.show('error', message, duration);
    }

    warning(message: string, duration = 4000): void {
        this.show('warning', message, duration);
    }

    info(message: string, duration = 3000): void {
        this.show('info', message, duration);
    }
}
