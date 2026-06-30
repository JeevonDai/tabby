import {
    SearchQuery,
    closeSearchPanel,
    findNext,
    findPrevious,
    getSearchQuery,
    replaceAll,
    replaceNext,
    setSearchQuery,
} from '@codemirror/search'
import { EditorView, Panel, ViewUpdate } from '@codemirror/view'

export interface YamlEditorSearchLabels {
    search: string
    replace: string
    replaceAll: string
    previousMatch: string
    nextMatch: string
    matchCase: string
    regularExpression: string
    wholeWord: string
    close: string
}

export class YamlEditorSearchPanel implements Panel {
    readonly dom: HTMLElement
    readonly top = true

    private readonly searchField: HTMLInputElement
    private readonly replaceField: HTMLInputElement | null
    private readonly resultCount: HTMLSpanElement
    private readonly caseButton: HTMLButtonElement
    private readonly regexpButton: HTMLButtonElement
    private readonly wholeWordButton: HTMLButtonElement
    private query: SearchQuery

    constructor (
        private readonly view: EditorView,
        labels: YamlEditorSearchLabels,
    ) {
        this.query = getSearchQuery(view.state)
        this.dom = document.createElement('div')
        this.dom.className = 'cm-search cm-yaml-search'
        this.dom.addEventListener('keydown', event => this.handleKeydown(event))

        const searchRow = document.createElement('div')
        searchRow.className = 'cm-yaml-search-row'

        this.searchField = this.createInput(labels.search, 'search')
        this.searchField.setAttribute('main-field', 'true')
        this.searchField.value = this.query.search
        this.searchField.addEventListener('input', () => this.commit())

        this.resultCount = document.createElement('span')
        this.resultCount.className = 'cm-yaml-search-count'
        this.resultCount.setAttribute('aria-live', 'polite')

        const previousButton = this.createButton('fa-chevron-up', labels.previousMatch, () => findPrevious(this.view))
        const nextButton = this.createButton('fa-chevron-down', labels.nextMatch, () => findNext(this.view))
        this.caseButton = this.createToggleButton('Aa', labels.matchCase, 'caseSensitive')
        this.regexpButton = this.createToggleButton('.*', labels.regularExpression, 'regexp')
        this.wholeWordButton = this.createToggleButton('ab', labels.wholeWord, 'wholeWord')
        const closeButton = this.createButton('fa-times', labels.close, () => closeSearchPanel(this.view))
        closeButton.classList.add('cm-yaml-search-close')

        searchRow.append(
            this.searchField,
            this.resultCount,
            previousButton,
            nextButton,
            this.caseButton,
            this.regexpButton,
            this.wholeWordButton,
            closeButton,
        )
        this.dom.append(searchRow)

        if (!view.state.readOnly) {
            const replaceRow = document.createElement('div')
            replaceRow.className = 'cm-yaml-search-row cm-yaml-replace-row'

            this.replaceField = this.createInput(labels.replace, 'replace')
            this.replaceField.classList.add('cm-yaml-replace-field')
            this.replaceField.value = this.query.replace
            this.replaceField.addEventListener('input', () => this.commit())

            const replaceButton = this.createTextButton(labels.replace, () => replaceNext(this.view))
            const replaceAllButton = this.createTextButton(labels.replaceAll, () => replaceAll(this.view))
            replaceRow.append(this.replaceField, replaceButton, replaceAllButton)
            this.dom.append(replaceRow)
        } else {
            this.replaceField = null
        }

        this.syncControls()
        this.updateResultCount()
    }

    mount (): void {
        this.searchField.select()
    }

    update (update: ViewUpdate): void {
        const nextQuery = getSearchQuery(update.state)
        if (!nextQuery.eq(this.query)) {
            this.query = nextQuery
            this.searchField.value = nextQuery.search
            if (this.replaceField) {
                this.replaceField.value = nextQuery.replace
            }
            this.syncControls()
        }
        if (update.docChanged || update.selectionSet || !nextQuery.eq(getSearchQuery(update.startState))) {
            this.updateResultCount()
        }
    }

    private createInput (placeholder: string, name: string): HTMLInputElement {
        const input = document.createElement('input')
        input.className = 'cm-textfield'
        input.name = name
        input.placeholder = placeholder
        input.setAttribute('aria-label', placeholder)
        input.autocomplete = 'off'
        input.spellcheck = false
        return input
    }

    private createButton (icon: string, label: string, action: () => unknown): HTMLButtonElement {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'cm-button cm-yaml-search-button'
        button.title = label
        button.setAttribute('aria-label', label)
        const iconElement = document.createElement('i')
        iconElement.className = `fas ${icon}`
        button.append(iconElement)
        button.addEventListener('click', () => action())
        return button
    }

    private createTextButton (label: string, action: () => unknown): HTMLButtonElement {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'cm-button cm-yaml-search-text-button'
        button.textContent = label
        button.addEventListener('click', () => action())
        return button
    }

    private createToggleButton (
        text: string,
        label: string,
        property: 'caseSensitive' | 'regexp' | 'wholeWord',
    ): HTMLButtonElement {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'cm-button cm-yaml-search-toggle'
        button.textContent = text
        button.title = label
        button.setAttribute('aria-label', label)
        button.addEventListener('click', () => {
            this.setQuery({ [property]: !this.query[property] })
        })
        return button
    }

    private commit (): void {
        this.setQuery({
            search: this.searchField.value,
            replace: this.replaceField?.value ?? this.query.replace,
        })
    }

    private setQuery (changes: Partial<Pick<SearchQuery, 'search' | 'replace' | 'caseSensitive' | 'regexp' | 'wholeWord'>>): void {
        const query = new SearchQuery({
            search: changes.search ?? this.query.search,
            replace: changes.replace ?? this.query.replace,
            caseSensitive: changes.caseSensitive ?? this.query.caseSensitive,
            regexp: changes.regexp ?? this.query.regexp,
            wholeWord: changes.wholeWord ?? this.query.wholeWord,
        })
        if (!query.eq(this.query)) {
            this.query = query
            this.view.dispatch({ effects: setSearchQuery.of(query) })
            this.syncControls()
        }
    }

    private syncControls (): void {
        this.setPressed(this.caseButton, this.query.caseSensitive)
        this.setPressed(this.regexpButton, this.query.regexp)
        this.setPressed(this.wholeWordButton, this.query.wholeWord)
    }

    private setPressed (button: HTMLButtonElement, pressed: boolean): void {
        button.classList.toggle('active', pressed)
        button.setAttribute('aria-pressed', String(pressed))
    }

    private updateResultCount (): void {
        if (!this.query.valid || !this.query.search) {
            this.resultCount.textContent = '0 / 0'
            this.resultCount.classList.toggle('cm-yaml-search-invalid', !this.query.valid)
            return
        }

        let total = 0
        let current = 0
        const selection = this.view.state.selection.main
        const cursor = this.query.getCursor(this.view.state)
        for (let next = cursor.next(); !next.done; next = cursor.next()) {
            total++
            if (next.value.from === selection.from && next.value.to === selection.to) {
                current = total
            }
        }
        this.resultCount.textContent = `${current || (total ? '–' : 0)} / ${total}`
        this.resultCount.classList.remove('cm-yaml-search-invalid')
    }

    private handleKeydown (event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.preventDefault()
            closeSearchPanel(this.view)
            this.view.focus()
            return
        }
        if (event.key !== 'Enter') {
            return
        }

        event.preventDefault()
        if (event.target === this.replaceField) {
            replaceNext(this.view)
        } else if (event.target === this.searchField) {
            (event.shiftKey ? findPrevious : findNext)(this.view)
        }
    }
}
