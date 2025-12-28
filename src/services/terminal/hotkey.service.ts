import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * 热键服务
 * 管理全局热键注册和处理
 */
@Injectable({
    providedIn: 'root'
})
export class HotkeyService {
    private hotkeyPressed$ = new Subject<string>();

    constructor() {}

    /**
     * 注册热键
     */
    registerHotkey(key: string, callback: () => void): void {
        // TODO: 实现热键注册
        console.log('Register hotkey', key);
    }

    /**
     * 取消注册热键
     */
    unregisterHotkey(key: string): void {
        // TODO: 实现热键取消注册
        console.log('Unregister hotkey', key);
    }

    /**
     * 订阅热键按下事件
     */
    onHotkeyPressed(): any {
        return this.hotkeyPressed$.asObservable();
    }

    /**
     * 触发热键事件
     */
    triggerHotkey(key: string): void {
        this.hotkeyPressed$.next(key);
    }

    /**
     * 检查热键是否已注册
     */
    isHotkeyRegistered(key: string): boolean {
        // TODO: 实现热键检查
        return false;
    }
}
