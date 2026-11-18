// Termos de uso provisórios (1.21). Idade mínima e licença do conteúdo ficam
// "a definir" até a versão final [ASSUMPTION: PRD §11 Q7 e Q13].
import type { LegalDocument } from './types';

export const TERMS_OF_USE: LegalDocument = {
  title: 'Termos de uso',
  version: '0.1',
  date: '2026-11-17',
  sections: [
    {
      title: 'O que é o Fluveny',
      paragraphs: [
        'O Fluveny é um App e um site para aprender inglês com Atividades curtas: diálogos, fala, escrita e jogos. É um projeto de extensão da UNIFAL-MG.',
        'Estes termos descrevem as regras de uso do Fluveny; a Política de privacidade explica como os dados são tratados. O aceite formal dos dois vem com o cadastro.',
      ],
    },
    {
      title: 'Uso educacional e gratuito',
      paragraphs: ['O Fluveny é gratuito e feito para fins educacionais. Não há cobrança, assinatura nem anúncios.'],
    },
    {
      title: 'Modo Visitante',
      paragraphs: [
        'Hoje você usa o Fluveny sem conta, no modo Visitante. O seu Progresso fica só no seu aparelho: se você limpar os dados do site ou do App, ou trocar de aparelho, ele se perde e não dá para recuperar.',
        'Criar conta e entrar ainda não estão disponíveis.',
      ],
    },
    {
      title: 'Conteúdo do curso',
      paragraphs: [
        'O conteúdo do curso é em inglês e foi preparado pela equipe do Fluveny. A correção das Atividades é automática e pode errar de vez em quando; ela serve para ajudar você a praticar, não como avaliação oficial nem certificado.',
        'A licença de uso do conteúdo será definida na versão final destes termos.',
      ],
    },
    {
      title: 'Conduta',
      paragraphs: [
        'Use o Fluveny para estudar. Não tente invadir, sobrecarregar ou atrapalhar o serviço, nem mandar requisições em massa ou automatizadas para o servidor.',
        'Não escreva dados pessoais de outras pessoas nas respostas.',
      ],
    },
    {
      title: 'Disponibilidade',
      paragraphs: [
        'O Fluveny está em homologação. Ele pode ficar fora do ar, mudar ou ter falhas a qualquer momento, sem aviso, e o conteúdo pode estar incompleto. Não há garantia de disponibilidade.',
      ],
    },
    {
      title: 'Idade mínima',
      paragraphs: ['A idade mínima para usar o Fluveny será definida na versão final destes termos.'],
    },
    {
      title: 'Mudanças nestes termos',
      paragraphs: [
        'Estes termos mudam conforme o Fluveny cresce e quando sair a versão final. Cada versão traz o número e a data no topo.',
      ],
    },
  ],
};
