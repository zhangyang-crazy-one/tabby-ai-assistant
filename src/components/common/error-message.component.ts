import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
    selector: 'app-error-message',
    templateUrl: './error-message.component.html',
    styleUrls: ['./error-message.component.scss']
})
export class ErrorMessageComponent {
    @Input() type: 'error' | 'warning' | 'info' | 'success' = 'error';
    @Input() title: string = '';
    @Input() message: string = '';
    @Input() details: string = '';
    @Input() dismissible: boolean = false;

    @Output() dismissed = new EventEmitter<void>();

    getIconClass(): string {
        const icons: { [key: string]: string } = {
            'error': 'icon-error',
            'warning': 'icon-warning',
            'info': 'icon-info',
            'success': 'icon-success'
        };
        return icons[this.type] || 'icon-error';
    }

    onDismiss(): void {
        this.dismissed.emit();
    }
}
