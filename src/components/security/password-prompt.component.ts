import { Component, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
    selector: 'app-password-prompt',
    templateUrl: './password-prompt.component.html',
    styleUrls: ['./password-prompt.component.scss']
})
export class PasswordPromptComponent {
    @Input() title: string = '密码验证';
    password = '';
    errorMessage = '';

    constructor(public activeModal: NgbActiveModal) {}

    submit(): void {
        if (this.password) {
            this.activeModal.close(this.password);
        } else {
            this.errorMessage = '请输入密码';
        }
    }

    cancel(): void {
        this.activeModal.dismiss('cancel');
    }
}
