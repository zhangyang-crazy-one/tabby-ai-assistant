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
        this.toastSubject.next({ id, type, message, duration });
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
