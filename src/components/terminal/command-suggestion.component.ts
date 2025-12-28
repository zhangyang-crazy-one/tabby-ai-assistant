import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { CommandResponse } from '../../types/ai.types';

@Component({
    selector: 'app-command-suggestion',
    templateUrl: './command-suggestion.component.html',
    styleUrls: ['./command-suggestion.component.scss']
})
export class CommandSuggestionComponent implements OnInit, OnDestroy {
    @Input() inputText = '';
    @Output() suggestionSelected = new EventEmitter<CommandResponse>();
    @Output() closed = new EventEmitter<void>();

    suggestions: CommandResponse[] = [];
    private inputSubject = new Subject<string>();
    private destroy$ = new Subject<void>();

    ngOnInit(): void {
        this.inputSubject.pipe(
            debounceTime(500),
            takeUntil(this.destroy$)
        ).subscribe(text => {
            this.generateSuggestions(text);
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    onInputChange(text: string): void {
        this.inputSubject.next(text);
    }

    private generateSuggestions(text: string): void {
        // TODO: 调用AI生成建议
        // 这里应该调用CommandGeneratorService
        this.suggestions = [];
    }

    selectSuggestion(suggestion: CommandResponse): void {
        this.suggestionSelected.emit(suggestion);
        this.close();
    }

    close(): void {
        this.closed.emit();
        this.suggestions = [];
    }
}
