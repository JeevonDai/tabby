import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const yamlDarkHighlightStyle = HighlightStyle.define([
    { tag: t.comment, color: '#65707a', fontStyle: 'italic' },
    { tag: t.meta, color: '#6d7882' },
    { tag: [t.propertyName, t.definition(t.propertyName)], color: '#8fa8bc' },
    { tag: t.string, color: '#b8a588' },
    { tag: [t.number, t.literal, t.inserted], color: '#9aab8f' },
    { tag: [t.bool, t.null, t.atom], color: '#8099ad' },
    { tag: [t.punctuation, t.separator, t.bracket], color: '#727d87' },
    { tag: [t.keyword, t.operator], color: '#8f9da8' },
    { tag: t.invalid, color: '#b07a7a' },
])

const yamlLightHighlightStyle = HighlightStyle.define([
    { tag: t.comment, color: '#7a848e', fontStyle: 'italic' },
    { tag: t.meta, color: '#7a848e' },
    { tag: [t.propertyName, t.definition(t.propertyName)], color: '#4f7390' },
    { tag: t.string, color: '#8a7349' },
    { tag: [t.number, t.literal, t.inserted], color: '#5f7352' },
    { tag: [t.bool, t.null, t.atom], color: '#4f6d84' },
    { tag: [t.punctuation, t.separator, t.bracket], color: '#6b7680' },
    { tag: [t.keyword, t.operator], color: '#5c6873' },
    { tag: t.invalid, color: '#a05858' },
])

export function yamlEditorSyntaxHighlighting (lightTheme: boolean) {
    return syntaxHighlighting(
        lightTheme ? yamlLightHighlightStyle : yamlDarkHighlightStyle,
        { fallback: true },
    )
}
