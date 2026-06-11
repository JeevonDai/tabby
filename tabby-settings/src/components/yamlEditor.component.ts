import {
    AfterViewInit,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    Output,
    SimpleChanges,
    ViewChild,
} from '@angular/core'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { yaml } from '@codemirror/lang-yaml'
import { search, searchKeymap, openSearchPanel } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { ConfigService, getCSSFontFamily } from 'tabby-core'
import { yamlEditorSyntaxHighlighting } from './yamlEditorHighlight'

_('Search')

/** @hidden */
@Component({
    selector: 'yaml-editor',
    templateUrl: './yamlEditor.component.pug',
    styleUrls: ['./yamlEditor.component.scss'],
})
export class YamlEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
    @Input() value = ''
    @Input() readonly = false
    @Output() valueChange = new EventEmitter<string>()

    @ViewChild('host', { static: true }) host: ElementRef<HTMLDivElement>

    private view: EditorView | null = null
    private readonly editableCompartment = new Compartment()

    constructor (
        private config: ConfigService,
    ) { }

    ngAfterViewInit (): void {
        this.view = new EditorView({
            parent: this.host.nativeElement,
            state: this.createState(this.value),
        })
    }

    ngOnChanges (changes: SimpleChanges): void {
        if (!this.view) {
            return
        }
        if (changes.value) {
            const nextValue = changes.value.currentValue ?? ''
            const currentValue = this.view.state.doc.toString()
            if (nextValue !== currentValue) {
                this.view.dispatch({
                    changes: { from: 0, to: currentValue.length, insert: nextValue },
                })
            }
        }
        if (changes.readonly) {
            this.view.dispatch({
                effects: this.editableCompartment.reconfigure(EditorView.editable.of(!this.readonly)),
            })
        }
    }

    ngOnDestroy (): void {
        this.view?.destroy()
        this.view = null
    }

    openSearch (): void {
        if (!this.view) {
            return
        }
        openSearchPanel(this.view)
        this.view.focus()
    }

    private createState (doc: string): EditorState {
        const lightTheme = this.config.store.appearance?.colorSchemeMode === 'light'
        const fontSize = Math.min(Math.max(this.config.store.terminal?.fontSize ?? 13, 12), 15)

        return EditorState.create({
            doc,
            extensions: [
                lineNumbers(),
                yaml(),
                history(),
                search({ top: true }),
                yamlEditorSyntaxHighlighting(lightTheme),
                keymap.of([
                    ...defaultKeymap,
                    ...historyKeymap,
                    ...searchKeymap,
                ]),
                this.editableCompartment.of(EditorView.editable.of(!this.readonly)),
                EditorView.lineWrapping,
                EditorView.updateListener.of(update => {
                    if (update.docChanged) {
                        this.valueChange.emit(update.state.doc.toString())
                    }
                }),
                EditorView.theme({
                    '&': {
                        height: '100%',
                        fontSize: `${fontSize}px`,
                        fontFamily: getCSSFontFamily(this.config.store),
                        backgroundColor: 'var(--bs-form-control-bg)',
                        color: 'var(--bs-body-color)',
                    },
                    '.cm-scroller': {
                        overflow: 'auto',
                        fontFamily: 'inherit',
                        lineHeight: '1.55',
                    },
                    '.cm-line': {
                        padding: '0 2px',
                    },
                    '.cm-content': {
                        caretColor: 'var(--bs-body-color)',
                        fontVariantLigatures: this.config.store.terminal?.ligatures ? 'contextual' : 'none',
                    },
                    '.cm-cursor, .cm-dropCursor': {
                        borderLeftColor: 'var(--bs-body-color)',
                    },
                    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
                        backgroundColor: 'var(--theme-bg-more-2) !important',
                    },
                    '.cm-activeLine': {
                        backgroundColor: 'var(--theme-bg-more)',
                    },
                    '.cm-gutters': {
                        backgroundColor: 'var(--theme-bg-more)',
                        color: 'var(--bs-secondary-color)',
                        border: 'none',
                    },
                    '.cm-activeLineGutter': {
                        backgroundColor: 'var(--theme-bg-more-2)',
                    },
                    '.cm-panels': {
                        backgroundColor: 'var(--theme-bg-more)',
                        color: 'var(--bs-body-color)',
                    },
                    '.cm-panels.cm-panels-top': {
                        borderBottom: '1px solid var(--bs-border-color)',
                    },
                    '.cm-textfield': {
                        backgroundColor: 'var(--bs-form-control-bg)',
                        color: 'var(--bs-body-color)',
                        border: '1px solid var(--bs-border-color)',
                        borderRadius: 'var(--bs-border-radius)',
                    },
                    '.cm-search': {
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '4px 6px',
                        padding: '4px 6px',
                        fontSize: '12px',
                        lineHeight: '1.2',
                    },
                    '.cm-search label': {
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        margin: '0',
                        lineHeight: '1.2',
                    },
                    '.cm-search input[type=checkbox]': {
                        margin: '0',
                        flexShrink: '0',
                    },
                    '.cm-search .cm-button, .cm-search button[name=close]': {
                        backgroundColor: 'var(--bs-secondary-bg, var(--theme-bg-more-2))',
                        color: 'var(--bs-secondary-color, var(--bs-body-color))',
                        border: '1px solid var(--bs-border-color)',
                        borderRadius: 'var(--bs-border-radius)',
                        padding: '2px 8px',
                        fontSize: '12px',
                        lineHeight: '1.2',
                        cursor: 'pointer',
                    },
                }),
            ],
        })
    }
}
