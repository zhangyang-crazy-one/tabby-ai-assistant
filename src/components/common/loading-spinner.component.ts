import { Component, Input } from '@angular/core';

@Component({
    selector: 'app-loading-spinner',
    templateUrl: './loading-spinner.component.html',
    styleUrls: ['./loading-spinner.component.scss']
})
export class LoadingSpinnerComponent {
    @Input() size: 'small' | 'medium' | 'large' = 'medium';
    @Input() message: string = '';
}
