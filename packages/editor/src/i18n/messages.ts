export type Locale = 'en' | 'sv'

export const LOCALES: readonly Locale[] = ['en', 'sv']

/** Values a message can interpolate: `{name}` in the text is replaced by `vars.name`. */
export type MessageVars = Record<string, string | number>

/**
 * A message that varies with a count. `other` is required; add the categories the language uses
 * (`one` for English and Swedish). The category is picked from `vars.count` with `Intl.PluralRules`.
 */
export type PluralMessage = { other: string } & Partial<
  Record<'zero' | 'one' | 'two' | 'few' | 'many', string>
>

export type Message = string | PluralMessage

export type MessageCatalog<Key extends string = string> = {
  readonly en: Readonly<Record<Key, Message>>
  readonly sv: Readonly<Record<Key, Message>>
}

/** The keys of a catalog, for tables that store a key and translate it when they render. */
export type MessageKey<Catalog extends MessageCatalog> = keyof Catalog['en'] & string

/**
 * Declares the messages of the code beside it, English first. `sv` must have exactly the keys of
 * `en`: a missing or extra key is a type error.
 */
export function defineMessages<En extends Record<string, Message>>(catalog: {
  en: En
  sv: { [Key in keyof NoInfer<En>]: Message }
}): MessageCatalog<keyof En & string> {
  return catalog
}

const pluralRules = new Map<Locale, Intl.PluralRules>()

function pluralCategory(locale: Locale, count: number): Intl.LDMLPluralRule {
  let rules = pluralRules.get(locale)
  if (!rules) {
    rules = new Intl.PluralRules(locale)
    pluralRules.set(locale, rules)
  }
  return rules.select(count)
}

/** One message of `catalog` in `locale`, with its placeholders filled. */
export function formatMessage(
  catalog: MessageCatalog,
  locale: Locale,
  key: string,
  vars?: MessageVars,
): string {
  const message = catalog[locale][key] as Message
  const template =
    typeof message === 'string'
      ? message
      : (message[pluralCategory(locale, Number(vars?.count))] ?? message.other)
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in vars ? String(vars[name]) : placeholder,
  )
}
