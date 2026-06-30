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
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { yaml } from '@codemirror/lang-yaml'
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit } from '@codemirror/language'
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import {
    EditorView,
    drawSelection,
    dropCursor,
    highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars,
    keymap,
    lineNumbers,
    rectangularSelection,
} from '@codemirror/view'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import { ConfigService, getCSSFontFamily, TranslateService } from 'tabby-core'
import { yamlEditorSyntaxHighlighting } from './yamlEditorHighlight'
import { YamlEditorSearchLabels, YamlEditorSearchPanel } from './yamlEditorSearchPanel'

_('Search')
_('Replace')
_('Replace all')
_('Previous match')
_('Next match')
_('Match case')
_('Regular expression')
_('Whole word')
_('Close')

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

    @ViewChild('host', { 'static': true }) host: ElementRef<HTMLDivElement>

    private view: EditorView | null = null
    private readonly editableCompartment = new Compartment()

    constructor (
        private config: ConfigService,
        private translate: TranslateService,
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
        if ('value' in changes) {
            const nextValue = changes.value.currentValue ?? ''
            const currentValue = this.view.state.doc.toString()
            if (nextValue !== currentValue) {
                this.view.dispatch({
                    changes: { from: 0, to: currentValue.length, insert: nextValue },
                })
            }
        }
        if ('readonly' in changes) {
            this.view.dispatch({
                effects: this.editableCompartment.reconfigure([
                    EditorView.editable.of(!this.readonly),
                    EditorState.readOnly.of(this.readonly),
                ]),
            })
        }
    }

    ngOnDestroy (): void {
        this.view?.destroy()
        this.view = null
    }

    openSearch (replace = false): void {
        if (!this.view) {
            return
        }
        openSearchPanel(this.view)
        const selector = replace ? '.cm-yaml-replace-field' : '[main-field=true]'
        requestAnimationFrame(() => {
            const field = this.host.nativeElement.querySelector<HTMLInputElement>(selector)
            field?.focus()
            field?.select()
        })
    }

    private createState (doc: string): EditorState {
        const lightTheme = this.config.store.appearance?.colorSchemeMode === 'light'
        const fontSize = Math.min(Math.max(this.config.store.terminal?.fontSize ?? 13, 12), 15)
        const selectionBackground = lightTheme ? 'rgba(13, 110, 253, 0.30)' : 'rgba(77, 163, 255, 0.42)'
        const selectionMatchBackground = lightTheme ? 'rgba(13, 110, 253, 0.14)' : 'rgba(77, 163, 255, 0.20)'
        const selectionMatchOutline = lightTheme ? 'rgba(13, 110, 253, 0.32)' : 'rgba(77, 163, 255, 0.42)'

        return EditorState.create({
            doc,
            extensions: [
                lineNumbers(),
                foldGutter(),
                highlightSpecialChars(),
                drawSelection(),
                dropCursor(),
                rectangularSelection(),
                highlightActiveLine(),
                highlightActiveLineGutter(),
                highlightSelectionMatches(),
                yaml(),
                history(),
                indentOnInput(),
                bracketMatching(),
                closeBrackets(),
                indentUnit.of('  '),
                EditorState.tabSize.of(2),
                EditorState.allowMultipleSelections.of(true),
                search({
                    top: true,
                    createPanel: view => new YamlEditorSearchPanel(view, this.getSearchLabels()),
                }),
                yamlEditorSyntaxHighlighting(lightTheme),
                keymap.of([
                    ...closeBracketsKeymap,
                    ...defaultKeymap,
                    ...historyKeymap,
                    ...searchKeymap,
                    ...foldKeymap,
                    indentWithTab,
                    {
                        key: 'Mod-h',
                        run: () => {
                            this.openSearch(true)
                            return true
                        },
                    },
                    {
                        key: 'Mod-Alt-f',
                        run: () => {
                            this.openSearch(true)
                            return true
                        },
                    },
                ]),
                this.editableCompartment.of([
                    EditorView.editable.of(!this.readonly),
                    EditorState.readOnly.of(this.readonly),
                ]),
                EditorView.lineWrapping,
                EditorView.contentAttributes.of({
                    autocapitalize: 'off',
                    autocomplete: 'off',
                    spellcheck: 'false',
                }),
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
                        backgroundColor: `${selectionBackground} !important`,
                    },
                    '.cm-selectionMatch': {
                        backgroundColor: `${selectionMatchBackground} !important`,
                        outline: `1px solid ${selectionMatchOutline}`,
                    },
                    '.cm-activeLine': {
                        backgroundColor: 'var(--theme-bg-more)',
                    },
                    '&:has(.cm-selectionBackground) .cm-activeLine': {
                        // The selection layer is behind the content. An opaque active-line
                        // background would otherwise hide the selection on its head line.
                        backgroundColor: 'transparent',
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
                    '.cm-searchMatch': {
                        backgroundColor: 'rgba(255, 193, 7, 0.32)',
                        outline: '1px solid rgba(255, 193, 7, 0.55)',
                    },
                    '.cm-searchMatch.cm-searchMatch-selected': {
                        backgroundColor: 'rgba(255, 152, 0, 0.55)',
                        outline: '1px solid rgba(255, 152, 0, 0.9)',
                    },
                }),
            ],
        })
    }

    private getSearchLabels (): YamlEditorSearchLabels {
        return {
            search: this.translate.instant('Search'),
            replace: this.translate.instant('Replace'),
            replaceAll: this.translate.instant('Replace all'),
            previousMatch: this.translate.instant('Previous match'),
            nextMatch: this.translate.instant('Next match'),
            matchCase: this.translate.instant('Match case'),
            regularExpression: this.translate.instant('Regular expression'),
            wholeWord: this.translate.instant('Whole word'),
            close: this.translate.instant('Close'),
        }
    }
}
