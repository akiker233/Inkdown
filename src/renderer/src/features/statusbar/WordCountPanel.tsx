import type { TextStats } from '../../editor/stats'
import { useI18n } from '../../i18n'

export function WordCountPanel({ stats }: { stats: TextStats }) {
  const { t } = useI18n()
  const rows: Array<{ label: string; value: number }> = [
    { label: t('count.words'), value: stats.words },
    { label: t('count.chars'), value: stats.chars },
    { label: t('count.noSpaces'), value: stats.charsNoSpaces },
    { label: t('count.lines'), value: stats.lines },
    { label: t('count.paragraphs'), value: stats.paragraphs }
  ]

  return (
    <div className="word-count-panel" role="dialog" aria-label={t('count.title')}>
      <div className="word-count-panel__title">{t('count.title')}</div>
      <dl className="word-count-panel__grid">
        {rows.map((row) => (
          <div className="word-count-panel__row" key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="word-count-panel__detail">
        {t('count.cjkLatin', { cjk: stats.cjk, latin: stats.latin })}
      </div>
      <div className="word-count-panel__detail">
        {t('count.reading', {
          value:
            stats.readingMinutes === 0
              ? t('count.dash')
              : t('count.minutes', { n: stats.readingMinutes })
        })}
      </div>
    </div>
  )
}
