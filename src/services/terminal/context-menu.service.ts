import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * 上下文菜单服务
 * 管理终端上下文菜单
 */
@Injectable({
    providedIn: 'root'
})
export class ContextMenuService {
    private menuItemSelected$ = new Subject<any>();

    constructor() {}

    /**
     * 显示上下文菜单
     */
    showMenu(x: number, y: number, items: any[]): void {
        // TODO: 实现上下文菜单显示
        console.log('Show context menu at', x, y, items);
    }

    /**
     * 隐藏上下文菜单
     */
    hideMenu(): void {
        // TODO: 实现上下文菜单隐藏
        console.log('Hide context menu');
    }

    /**
     * 订阅菜单项选择事件
     */
    onMenuItemSelected(): any {
        return this.menuItemSelected$.asObservable();
    }

    /**
     * 触发菜单项选择
     */
    selectMenuItem(item: any): void {
        this.menuItemSelected$.next(item);
    }
}
