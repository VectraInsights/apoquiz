import type { Question } from "@/lib/types";

/**
 * Quiz de exemplo usado no botao "Ver exemplo".
 * Serve para experimentar a interface sem precisar de um PDF.
 */
export const SAMPLE_QUESTIONS: Question[] = [
  {
    id: "s1",
    number: 1,
    statement:
      "Nos termos da Constituição Federal, a seguridade social compreende um conjunto integrado de ações destinadas a assegurar os direitos relativos à saúde, à previdência, à assistência social e ao:",
    options: [
      { label: "A", text: "ensino" },
      { label: "B", text: "turismo" },
      { label: "C", text: "trabalho" },
      { label: "D", text: "abastecimento" },
    ],
    correct: "C",
    explanation:
      "O art. 194 da CF/88 lista quatro direitos: saúde, previdência, assistência social e trabalho. A alternativa C é a única que consta no texto constitucional.",
    topic: "Direito Constitucional",
    level: "facil",
    answerSource: "gabarito",
    page: 1,
  },
  {
    id: "s2",
    number: 2,
    statement: "Se x + y = 7 e xy = 12, então o valor de x² + y² é igual a:",
    options: [
      { label: "A", text: "25" },
      { label: "B", text: "37" },
      { label: "C", text: "49" },
      { label: "D", text: "13" },
    ],
    correct: "A",
    explanation:
      "Como (x + y)² = x² + 2xy + y², temos 49 = x² + y² + 24. Logo x² + y² = 49 − 24 = 25.",
    topic: "Matemática",
    level: "facil",
    answerSource: "gabarito",
    page: 1,
  },
  {
    id: "s3",
    number: 3,
    statement:
      "A quantidade de calor necessária para aquecer 200 g de água de 20 °C até 60 °C, sendo c = 1 cal/(g·°C), é de, aproximadamente:",
    options: [
      { label: "A", text: "800 cal" },
      { label: "B", text: "8 000 cal" },
      { label: "C", text: "80 cal" },
      { label: "D", text: "4 000 cal" },
    ],
    correct: "B",
    explanation:
      "Q = m · c · ΔT = 200 · 1 · 40 = 8 000 cal, ou seja, 8 kcal.",
    topic: "Física",
    level: "medio",
    answerSource: "gabarito",
    page: 1,
  },
  {
    id: "s4",
    number: 4,
    statement:
      "O número de prótons, nêutrons e elétrons de um átomo de enxofre (S), de número atômico 16 e número de massa 32, é, respectivamente:",
    options: [
      { label: "A", text: "16, 16, 18" },
      { label: "B", text: "16, 16, 16" },
      { label: "C", text: "18, 14, 16" },
      { label: "D", text: "32, 16, 16" },
    ],
    correct: "B",
    explanation:
      "Prótons = Z = 16; nêutrons = A − Z = 32 − 16 = 16; elétrons = 16 (átomo neutro).",
    topic: "Química",
    level: "medio",
    answerSource: "gabarito",
    page: 1,
  },
  {
    id: "s5",
    number: 5,
    statement:
      "Na mitose, a fase em que os cromossomos se alinham no plano equatorial da célula é chamada de:",
    options: [
      { label: "A", text: "prófase" },
      { label: "B", text: "metáfase" },
      { label: "C", text: "anáfase" },
      { label: "D", text: "telófase" },
    ],
    correct: "B",
    explanation:
      "Na metáfase os cromossomos duplicados alinham-se no equador da célula, formando a placa equatorial.",
    topic: "Biologia",
    level: "facil",
    answerSource: "gabarito",
    page: 1,
  },
  {
    id: "s6",
    number: 6,
    statement:
      "O documento conhecido como Magna Carta (1215) limitou o poder da monarquia inglesa e foi assinado pelo rei:",
    options: [
      { label: "A", text: "Henrique VIII" },
      { label: "B", text: "João sem Terra" },
      { label: "C", text: "Eduardo I" },
      { label: "D", text: "Canuto, o Grande" },
    ],
    correct: "B",
    explanation:
      "João sem Terra foi obrigado pelos barões a assinar a Carta de 1215, que limitava o poder real e reforçava privilégios da nobreza.",
    topic: "História",
    level: "medio",
    answerSource: "gabarito",
    page: 1,
  },
  {
    id: "s7",
    number: 7,
    statement:
      "Na frase “Entreguei o relatório ao meu chefe”, o segmento destacado é classificado como:",
    options: [
      { label: "A", text: "objeto direto" },
      { label: "B", text: "objeto indireto" },
      { label: "C", text: "adjunto adnominal" },
      { label: "D", text: "predicativo do sujeito" },
    ],
    correct: "B",
    explanation:
      "O verbo “entreguei” exige objeto direto, e “ao meu chefe” é o destinatário da ação: objeto indireto (complemento oblíquo nominal).",
    topic: "Língua Portuguesa",
    level: "dificil",
    answerSource: "gabarito",
    page: 1,
  },
  {
    id: "s8",
    number: 8,
    statement:
      "A fórmula =SE(A1>10;\"Sim\";\"Não\") em uma planilha retorna o texto “Sim” quando:",
    options: [
      { label: "A", text: "a célula A1 for maior que 10" },
      { label: "B", text: "a célula A1 for menor que 10" },
      { label: "C", text: "a célula A1 estiver vazia" },
      { label: "D", text: "a célula A1 contiver texto" },
    ],
    correct: "A",
    explanation:
      "A função SE testa a condição A1>10: se for verdadeira, devolve o primeiro valor (“Sim”); caso contrário, “Não”.",
    topic: "Informática",
    level: "facil",
    answerSource: "gabarito",
    page: 1,
  },
  {
    id: "s9",
    number: 9,
    statement:
      "A área de um círculo de raio 6 cm, considerando π = 3, vale:",
    options: [
      { label: "A", text: "36 cm²" },
      { label: "B", text: "72 cm²" },
      { label: "C", text: "108 cm²" },
      { label: "D", text: "216 cm²" },
    ],
    correct: "C",
    explanation:
      "A = π · r² = 3 · 36 = 108 cm².",
    topic: "Matemática",
    level: "facil",
    answerSource: "gabarito",
    page: 1,
  },
  {
    id: "s10",
    number: 10,
    statement:
      "A foz do Rio Amazonas, por onde ele deságua no Oceano Atlântico, fica no estado do:",
    options: [
      { label: "A", text: "Pará" },
      { label: "B", text: "Amapá" },
      { label: "C", text: "Amazonas" },
      { label: "D", text: "Maranhão" },
    ],
    correct: "A",
    explanation:
      "O Amazonas deságua no Atlântico e forma uma grande foz no estado do Pará, entre as regiões de Marajó e do Baixo Amazonas.",
    topic: "Geografia",
    level: "facil",
    answerSource: "gabarito",
    page: 1,
  },
];
