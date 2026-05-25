import { jsPDF } from "jspdf"
import { API } from "@/lib/utils"

interface ResultData {
  id: string
  name: string | null
  telegram_username: string | null
  phone: string | null
  created_at: string
  freedom_score: number
  sexuality_score: number
  total_score: number
  diagnosis: string | null
  answers: Record<string, string> | null
}

// ── Extended Recommendation engine (same as in womens test) ──────────────
interface RecommendationCondition {
  questionId: string
  targetValues: string[]
}

interface ExtendedRecommendation {
  id: string
  category: 'sexuality' | 'freedom'
  title: string
  description: string
  conditions: RecommendationCondition[]
}

const femaleRecommendations: ExtendedRecommendation[] = [
  {
    id: 'female_sexuality_appearance_shame',
    category: 'sexuality',
    title: 'Переживания о своей внешности в глазах мужчины',
    description: 'Переживания о своей внешности в глазах мужчины, чувство стыда или вины за проявления сексуальности — явление, что чаще всего мешает девушке получить максимальное удовольствие, яркий оргазм и полноценную разрядку в сексе.\n\nПо сути вместо того, чтобы расслабиться и кайфовать, ты скорее всего думаешь: а красива ли у меня грудь/попа/вэджайна? А не сильно ли у меня кривится лицо когда я стону или кончаю? А нравится ли ему? А вдруг он начнёт меня осуждать или ругать?',
    conditions: [
      { questionId: 'question_1', targetValues: ['1', '2'] },
      { questionId: 'question_6', targetValues: ['1', '2'] }
    ]
  },
  {
    id: 'female_sexuality_control_fear',
    category: 'sexuality',
    title: 'Страх отпустить контроль, отсутствие навыка расслабления',
    description: 'Не способность «отпустить себя » — следствие остальных твоих переживаний. А значит есть зажатый в теле стресс, который (если с ним не поработать) со временем станет сначала психосоматикой, а потом и хроникой.\n\nСкорее всего есть переживания в процессе секса, как о самом процессе, так и о чём-то стороннем — отношениях, детях, работе.\n\nИ совершенно точно есть гиперконтроль и страх этот контроль отпустить.\n\nЕстественно, к удовольствию и счастью эта тактика не ведёт, а стратегия «оставить всё так» рушит твоё здоровье и отношения.',
    conditions: [
      { questionId: 'question_3', targetValues: ['1', '2'] }
    ]
  },
  {
    id: 'female_sexuality_arousal_anxiety',
    category: 'sexuality',
    title: 'Переживания об уровне возбуждения и страх остаться без оргазма',
    description: 'Страх и напряжение в сторону чего-то повышает его вероятность. Так собаки рычат, лают и нападают на людей, что боятся собак. Так расстаются те, кто сильнее всего боится остаться один.\n\nТак и ты скорее всего остаёшься без оргазма — слишком сильно боишься, что его не будет, слишком отчаянно хочешь его получить. А может быть уже совсем отчаялась и решила, что тебе не суждено.\n\nИ это самообман, ошибки мышления. На самом деле скорее всего тут всё можно изменить.',
    conditions: [
      { questionId: 'question_8', targetValues: ['1', '2'] },
      { questionId: 'question_15', targetValues: ['1', '2'] }
    ]
  },
  {
    id: 'female_sexuality_no_orgasm',
    category: 'sexuality',
    title: 'Отсутствие оргазма в сексе',
    description: 'И проблема даже не в том, что его нет. А в том, что происходит когда его нет: твоё психологическое состояние всё хуже. Самооценка всё ниже, уверенность покидает чат.\n\nНачинаются проблемы со здоровьем: организм не получает сигналы об успешности размножения, не понимает, для чего живёт, и включает механизмы старения и саморазрушения.\n\nТруд твоего мужчины не заканчиваются результатом, или заканчиваются фальшивым результатом. В итоге у тебя нет такой же ценности в сексе, его желание всё меньше, а ваши отношения всё хуже.',
    conditions: [
      { questionId: 'question_12', targetValues: ['1', '2'] }
    ]
  },
  {
    id: 'female_freedom_emotional_dependency',
    category: 'freedom',
    title: 'Эмоциональная зависимость',
    description: 'Ты «срастаешься» чувствами со своим партнёром: его слова, действия, оценка слишком сильно на тебя влияют. Не так посмотрел, с мамой поругался, что-то ляпнул — и ты сразу переживаешь.\n\nК счастью и удовольствию, к гармоничным и долгосрочным отношениям это не ведёт.',
    conditions: [
      { questionId: 'question_16', targetValues: ['1', '2'] },
      { questionId: 'question_23', targetValues: ['1', '2'] }
    ]
  },
  {
    id: 'female_freedom_breakup_fear',
    category: 'freedom',
    title: 'Страх расставания, потери отношений, развода, одиночества',
    description: 'Страх и напряжение в сторону чего-то повышает его вероятность. А расставание на фоне страха остаться одной особенно болезненно. Самая противная связка — страх расставания на фоне отсутствия отношений. Тебе уже было нестерпимо больно в прошлый раз, а может и уже не раз. И ты больше такой боли не хочешь. А тогда зачем сближаться и начинать отношения?\n\nЕстественно, это сбой в психике: новые отношения точно будут другими, а бояться их завершения или выстраивать их из страха — проверенный путь к зависимости и страданиям.',
    conditions: [
      { questionId: 'question_19', targetValues: ['1', '2'] }
    ]
  },
  {
    id: 'female_freedom_failure_fear',
    category: 'freedom',
    title: 'Страх ошибки, поражения',
    description: 'Естественно, повышает вероятность ошибок и поражений. Причём касается всего: обучения, карьеры или бизнеса, отношений. Частый спутник РПП, ожирения и целлюлита, кстати.\n\nПри том, что без ошибок невозможно ничему новому научиться и ничего значимого сделать. У Илона Маска падают ракеты — и люди радуются этой ошибке: следующая точно полетит!\n\nЭтот страх тебе точно нужен?',
    conditions: [
      { questionId: 'question_21', targetValues: ['1', '2'] }
    ]
  },
  {
    id: 'female_freedom_betrayal_fear',
    category: 'freedom',
    title: 'Страх обмана, страх измены',
    description: 'Боишься что обманет? Следишь за другими женщинами рядом? Палишь переписки и время когда он был онлайн?\n\nДобро пожаловать на качельки! И ещё раз напомню, что напряжение в сторону события повышает вероятность этого события.\n\nСлезть можно. Спроси меня, как.',
    conditions: [
      { questionId: 'question_22', targetValues: ['1', '2'] }
    ]
  },
  {
    id: 'female_freedom_communication_insecurity',
    category: 'freedom',
    title: 'Неуверенность в общении',
    description: 'Осознавать, что мужчин вокруг тебя много, а ты у себя одна. И что ты можешь легко и спокойно знакомиться с кем угодно в любом контексте и проявляться так, как ты сама этого хочешь.\n\nВот, это не про тебя всё. По крайней мере пока.',
    conditions: [
      { questionId: 'question_25', targetValues: ['1', '2'] }
    ]
  }
]

function getExtendedRecommendations(answers: Record<string, string>): ExtendedRecommendation[] {
  return femaleRecommendations.filter(rec =>
    rec.conditions.some(cond =>
      answers[cond.questionId] && cond.targetValues.includes(answers[cond.questionId])
    )
  )
}

function getFemaleDiagnosis(freedomScore: number, sexualityScore: number) {
  let sexualityDesc: string, freedomDesc: string
  if (sexualityScore <= 18) {
    sexualityDesc = "Ты не плохая. Просто твоё тело пока ещё в броне. Мозг кричит: «Расслабься!». А нервная система отвечает: «Бро, серьёзно?». Работать с этим не про «ломать себя», а про мягкое освобождение. Я работаю с этим работаем бережно, постепенно, по частям."
  } else if (sexualityScore <= 37) {
    sexualityDesc = "Где-то внутри тебя живут «мисс стыд» и «мисс контроль». Может мама не так подышала в детстве в твою сторону, может школьная форма была слишком застёгнутой. Но ты можешь иначе. Честно. Просто мозг пока не верит, а тело уже просит. Тут нужен не «волшебный мужчина», а работа с собой."
  } else if (sexualityScore <= 55) {
    sexualityDesc = "Ты уже умеешь играть, но всё ещё боишься отпустить тормоз. Тело то включается, то резко тормозит — будто кто-то держит ручник. Если хочешь перейти из «почти кайфа» в состояние полной власти над собой и желаниями — пора снимать этот запрет."
  } else {
    sexualityDesc = "Красотка! Поздравляю: ты вообще богиня сексуальности. Твоё тело — не клетка, а площадка для исследований и удовольствий. Раскрепощение у тебя не из книжек, а из ощущений. Не забывай этим делиться — вдохновляй других! Ну и ты же знаешь, что всегда можно расслабиться ещё глубже. А потом получить ещё больше наслаждения!"
  }
  if (freedomScore <= 11) {
    freedomDesc = "Хронический сжиматель булок — ты живёшь в постоянном напряжении, будто ждёшь удара. Ты заслуживаешь жить не в ожидании боли, а в состоянии свободы. Да, где-то там были значительные травмы, может даже насилие. И это важно признать и переосмыслить. Другой сценарий есть. Твоя эмоциональная система может научиться жить иначе."
  } else if (freedomScore <= 23) {
    freedomDesc = "Ты знаешь, что такое «секс по тревоге»? Когда голова кричит, а тело прикидывается мёртвым — и ты продолжаешь улыбаться, будто так и должно быть. Поздравляю, ты эксперт по играм с нервами. Нет, ты не сломана, просто тревога — твой автоматический ответ на близость и эмоции."
  } else if (freedomScore <= 37) {
    freedomDesc = "Где-то внутри тебя всё ещё живёт внутренний критик, который спрашивает: — А точно можно? — А не слишком? — А вдруг он уйдёт? Ответ: да, можно. Да, не слишком. А если уйдёт — значит, ты как и прежде свободна, а не брошена. Но мало об этом просто сказать: это важно в себя прошить вместо тревоги."
  } else {
    freedomDesc = "Ты умеешь быть в себе, не впадать в паранойю, не цепляться, не зависеть. Ты не тревожишь партнёра своими тревогами — потому что сама держишь опору. Это дорогого стоит. Но давай честно: немного сверхспокойствия — это тоже форма контроля. А вдруг можно позволить себе чуть больше хаоса, чувств, кайфа?"
  }
  return { sexualityDesc, freedomDesc }
}

const ANSWER_LABELS: Record<string, string> = {
  "1": "Да / Очень / Никогда",
  "2": "Скорее да / Часто / Редко",
  "3": "Скорее нет / Иногда",
  "4": "Нет / Никогда",
}

// Per-question readable answer options (index = question_N - 1)
const QUESTION_OPTIONS: [string, string, string, string][] = [
  ["Да, не комфортно", "Скорее да", "Скорее нет", "Нет, комфортно"],
  ["Да, переживаю", "Часто переживаю", "Иногда", "Нет, не переживаю"],
  ["Нет, не получается", "Редко", "Часто", "Да, всегда"],
  ["Да, боюсь", "Скорее боюсь", "Скорее нет", "Нет, не боюсь"],
  ["Да, боюсь", "Скорее боюсь", "Скорее нет", "Нет, не боюсь"],
  ["Да, стыдно", "Скорее стыдно", "Скорее нет", "Нет, не стыдно"],
  ["Да, неприятны", "Скорее да", "Скорее нет", "Нет, приятны"],
  ["Да, переживаю", "Часто", "Иногда", "Нет"],
  ["Да, неприятны", "Скорее да", "Скорее нет", "Нет"],
  ["Да, боюсь", "Скорее боюсь", "Скорее нет", "Нет, не боюсь"],
  ["Да, тяжело", "Скорее да", "Скорее нет", "Нет, легко"],
  ["Никогда", "Редко", "Часто", "Всегда"],
  ["Да, стыжусь", "Часто", "Иногда", "Нет"],
  ["Да, виню", "Скорее да", "Скорее нет", "Нет"],
  ["Да, тревожусь", "Часто", "Иногда", "Нет"],
  ["Да, зависит", "Сильно зависит", "Иногда", "Нет"],
  ["Да, боюсь", "Часто", "Иногда", "Нет"],
  ["Да, зависима", "Скорее да", "Скорее нет", "Нет, независима"],
  ["Да, есть опыт", "Был давно", "Незначительный", "Нет"],
  ["Да, дискомфорт", "Часто", "Иногда", "Нет"],
  ["Да, боюсь", "Часто", "Иногда", "Нет"],
  ["Да, боюсь", "Часто", "Иногда", "Нет"],
  ["Да, тревожусь", "Часто", "Иногда", "Нет"],
  ["Да, стремлюсь", "Часто", "Иногда", "Нет"],
  ["Очень дискомфортно", "Дискомфортно", "Нормально", "Легко"],
]

const QUESTIONS = [
  "Мне не комфортно быть голой на глазах у мужчины в контексте секса",
  "Во время секса я переживаю, что мужчине не нравится что-то в моей внешности",
  "У меня получается расслабиться и «отключить голову» в сексе",
  "Во время секса я переживаю, что мужчина сделает что-то неприятное для меня",
  "Во время секса я переживаю, что мужчина скажет мне что-то неприятное",
  "Мне стыдно мастурбировать, ласкать себя при партнёре",
  "Мне неприятны прикосновения партнёра, когда я возбуждена",
  "Я переживаю, что я недостаточно возбуждена / недостаточно мокрая",
  "Мне неприятны прикосновения партнёра в моём спокойном состоянии",
  "Я переживаю, когда говорю о сексе, рассказываю о желаниях",
  "Во время секса мне тяжело стонать и издавать звуки",
  "Во время секса с мужчиной я получаю оргазм",
  "После секса я стесняюсь или осуждаю себя",
  "Я ругаю себя за желание секса с кем-то кроме своего партнёра",
  "Во время секса я переживаю, что у меня не получится прийти к оргазму",
  "Моё настроение сильно меняется от слов или действий партнёра",
  "Я переживаю о расставании / разводе / потере отношений",
  "Я финансово зависима от своего партнёра",
  "У меня есть опыт болезненного разрыва отношений",
  "Я чувствую дискомфорт, когда вспоминаю бывшего партнёра",
  "Я боюсь, что у меня что-то не получится. Боюсь ошибки",
  "Я переживаю, что мужчина обманет меня или изменит",
  "Когда партнёр не отвечает сразу, я переживаю",
  "Я стремлюсь быть хорошей, правильной, удобной для мужчины",
  "Для меня дискомфортно подойти к незнакомому парню",
]

async function createPdfWithCyrillic(): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  const fontUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf"
  const response = await fetch(fontUrl)
  const buffer = await response.arrayBuffer()
  const binary = Array.from(new Uint8Array(buffer)).map((b) => String.fromCharCode(b)).join("")
  const base64 = btoa(binary)

  doc.addFileToVFS("Roboto-Regular.ttf", base64)
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal")
  doc.setFont("Roboto")

  return doc
}

export async function generateFemalePdf(result: ResultData): Promise<jsPDF> {
  const doc = await createPdfWithCyrillic()
  const pw = doc.internal.pageSize.getWidth()
  let y = 20
  const margin = 15

  // Header
  doc.setFontSize(22)
  doc.setTextColor(144, 57, 153)
  doc.text("Шкала Шумкина", margin, y)
  doc.setFontSize(10)
  doc.setTextColor(128, 128, 128)
  doc.text("Диагностика сексуальности", margin, y + 6)
  y += 20

  // Patient info + diagnosis
  const patientName = result.name || "—"
  const patientNick = result.telegram_username ? `@${result.telegram_username.replace(/^@+/, "")}` : ""
  const patientPhone = result.phone || ""
  const dateStr = result.created_at ? new Date(result.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"

  doc.setFontSize(16)
  doc.setTextColor(0, 0, 0)
  doc.text(result.diagnosis || "—", margin, y)
  y += 8

  doc.setFontSize(11)
  doc.setTextColor(80, 80, 80)
  const infoLine = [patientName, patientNick, patientPhone].filter(Boolean).join(" — ")
  doc.text(`${infoLine} — ${dateStr}`, margin, y)
  y += 15

  // Scores in two blocks
  const blockW = pw / 2 - 20
  doc.setFillColor(245, 240, 255)
  doc.roundedRect(margin, y, blockW, 30, 3, 3, "F")
  doc.setFontSize(11)
  doc.setTextColor(144, 57, 153)
  doc.text("Свобода (Тревожность)", margin + 5, y + 10)
  doc.setFontSize(18)
  doc.setTextColor(0, 0, 0)
  doc.text(`${result.freedom_score} / 40`, margin + 5, y + 22)

  doc.setFillColor(245, 240, 255)
  doc.roundedRect(pw / 2 + 5, y, blockW, 30, 3, 3, "F")
  doc.setFontSize(11)
  doc.setTextColor(144, 57, 153)
  doc.text("Раскрепощённость", pw / 2 + 10, y + 10)
  doc.setFontSize(18)
  doc.setTextColor(0, 0, 0)
  doc.text(`${result.sexuality_score} / 60`, pw / 2 + 10, y + 22)
  y += 45

  // ── Portrait section ────────────────────────────────────────────────
  const diag = getFemaleDiagnosis(result.freedom_score, result.sexuality_score)
  if (diag.sexualityDesc || diag.freedomDesc) {
    doc.setFontSize(14)
    doc.setTextColor(0, 0, 0)
    doc.text("Твой портрет:", margin, y)
    y += 8
    doc.setFontSize(10)
    doc.setTextColor(60, 60, 60)

    if (diag.sexualityDesc) {
      const sexLines = doc.splitTextToSize(diag.sexualityDesc, pw - 30)
      doc.text(sexLines, margin, y)
      y += sexLines.length * 5 + 5
    }
    if (diag.freedomDesc) {
      const freeLines = doc.splitTextToSize(diag.freedomDesc, pw - 30)
      doc.text(freeLines, margin, y)
      y += freeLines.length * 5 + 15
    }
  }

  // ── Recommendations section ──────────────────────────────────────────
  const answers = result.answers || {}
  const recommendations = getExtendedRecommendations(answers)

  if (recommendations.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(14)
    doc.setTextColor(0, 0, 0)
    doc.text("Рекомендации для работы над собой:", margin, y)
    y += 10

    doc.setFontSize(10)
    recommendations.forEach((rec, i) => {
      if (y > doc.internal.pageSize.getHeight() - 50) {
        doc.addPage()
        y = 20
      }
      doc.setTextColor(144, 57, 153)
      doc.setFontSize(11)
      doc.text(`${i + 1}. ${rec.title}`, margin, y)
      y += 6

      doc.setTextColor(60, 60, 60)
      doc.setFontSize(9)
      const descLines = doc.splitTextToSize(rec.description, pw - 30)
      doc.text(descLines, margin, y)
      y += descLines.length * 4 + 8
    })
    y += 10
  }

  // Answers section
  doc.setFontSize(14)
  doc.setTextColor(0, 0, 0)
  doc.text("Детализация ответов", margin, y)
  y += 10

  QUESTIONS.forEach((qText, i) => {
    if (y > doc.internal.pageSize.getHeight() - 25) {
      doc.addPage()
      y = 20
    }

    const key = `question_${i + 1}`
    const ans = answers[key] || answers[String(i + 1)]
    const val = parseInt(ans || "0", 10)
    const opts = QUESTION_OPTIONS[i]
    const label = opts ? (opts[val - 1] || ans || "—") : (ANSWER_LABELS[String(val)] || ans || "—")
    const isProblem = val === 1 || val === 2
    const isSevere = val === 1

    if (isSevere) {
      doc.setFillColor(255, 230, 230)
      doc.roundedRect(margin, y - 1, pw - 30, 6, 1, 1, "F")
    } else if (isProblem) {
      doc.setFillColor(255, 245, 225)
      doc.roundedRect(margin, y - 1, pw - 30, 6, 1, 1, "F")
    }

    doc.setFontSize(8)
    doc.setTextColor(isProblem ? 180 : 80, isProblem ? 30 : 80, isProblem ? 30 : 80)
    doc.text(qText, margin, y + 1)

    const [r, g, b] = isSevere ? [200, 30, 30] : isProblem ? [200, 120, 0] : [50, 150, 50]
    doc.setTextColor(r, g, b)
    doc.setFont("Roboto", "normal")
    doc.setFontSize(8)
    const marker = isProblem ? `[${isSevere ? "!" : "?"}]` : "[OK]"
    doc.text(`${marker} ${label}`, pw - margin, y + 1, { align: "right" })

    y += 8
  })

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(180, 180, 180)
    doc.text("Personal OS CRM — Конфиденциально", margin, doc.internal.pageSize.getHeight() - 10)
    doc.text(`Стр. ${i} из ${pageCount}`, pw - margin, doc.internal.pageSize.getHeight() - 10, { align: "right" })
  }

  return doc
}

export async function downloadFemalePdf(result: ResultData): Promise<void> {
  const doc = await generateFemalePdf(result)
  const name = result.name || result.telegram_username || "unknown"
  const date = result.created_at ? new Date(result.created_at).toISOString().slice(0, 10) : "nodate"
  doc.save(`shumkin_scale_${name}_${date}.pdf`)
}
