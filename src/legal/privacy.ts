// Política de privacidade provisória (1.21). Descreve só o que o código faz hoje,
// no modo Visitante (Épico 1). Mudou o que o App, a API ou o Worker tratam: mude este texto,
// a versão e a data no mesmo PR.
import type { LegalDocument } from './types';

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Política de privacidade',
  version: '0.1',
  date: '2026-11-17',
  sections: [
    {
      title: 'Sobre esta política',
      paragraphs: [
        'Aqui a gente explica quais dados o Fluveny trata quando você usa o App ou o site sem conta (o modo Visitante), para que servem, onde ficam e com quem passam. Hoje o Fluveny só tem o modo Visitante: não há cadastro, login nem e-mail.',
        'O Fluveny é um projeto de extensão da UNIFAL-MG. Quem é o controlador dos dados e qual é o canal de contato para assuntos de privacidade ainda estão sendo definidos com a coordenação do projeto. Os dois entram na versão final desta política.',
      ],
    },
    {
      title: 'O que fica no seu aparelho',
      paragraphs: [
        'Um identificador aleatório do aparelho (deviceId), criado e guardado no aparelho na primeira vez que você usa o Fluveny. Ele não tem seu nome nem nada que identifique você diretamente. Ele também vai ao servidor, como explicado abaixo.',
        'Só no aparelho ficam o nome e o país que você digita no Diálogo, o pronome que você escolhe, o seu Progresso e o XP, e os recibos das Atividades que você concluiu.',
        'Esses dados (e o deviceId) ficam guardados no próprio aparelho: no navegador (localStorage), no site, e num banco local (SQLite), no App Android. Eles somem quando você limpa os dados do site no navegador ou os dados do App no Android.',
      ],
    },
    {
      title: 'O que vai para o nosso servidor',
      paragraphs: [
        'Quando você responde ou conclui uma Atividade, o App manda ao servidor o deviceId, qual Atividade foi, o resultado e o tempo de estudo. O deviceId também serve para limitar o número de requisições por aparelho.',
        'Nas Atividades avaliadas, a sua resposta também vai, para ser corrigida. Antes de sair do aparelho, o nome e o país que você digitou são trocados por marcadores, quando aparecem na resposta.',
        'Na Fala, vai a transcrição do que você disse, com o nome e o país trocados da mesma forma. Ela é corrigida e não é guardada.',
        'O texto que você escreve na Resposta Livre nunca sai do aparelho.',
        'O servidor guarda a primeira tentativa de cada Atividade (com o deviceId, o resultado, o XP e o tempo de estudo, mas sem a resposta) por até 90 dias. Depois disso, ela é apagada.',
      ],
    },
    {
      title: 'Seu endereço IP',
      paragraphs: [
        'No servidor do Fluveny, o endereço IP da sua conexão é usado só para limitar o número de requisições e proteger o serviço contra abuso. Essa contagem fica na memória do servidor, e o servidor do Fluveny não grava o IP.',
        'A Cloudflare e o Render, que levam as requisições até o servidor, podem manter registros de acesso próprios, com o IP, pelas regras deles.',
      ],
    },
    {
      title: 'Microfone e reconhecimento de fala',
      paragraphs: [
        'Na Fala, o microfone só é usado depois do aviso e da sua permissão. O Fluveny não grava nem guarda o áudio.',
        'Quem transcreve a sua fala é o reconhecimento de voz do seu navegador, no site, que pode enviar o áudio ao Google ou à Apple, ou o do Android, no App, que pode enviar o áudio ao Google. Esse envio segue as regras de privacidade de quem faz o reconhecimento.',
        'Se você não quiser usar o microfone, toque em "Não posso falar agora": a Atividade é pulada, sem XP.',
      ],
    },
    {
      title: 'Com quem os dados passam',
      paragraphs: [
        'Cloudflare: serve o site e repassa as requisições do App e do site para o servidor.',
        'Render: hospeda o servidor (a API) do Fluveny.',
        'MongoDB Atlas: guarda o banco de dados do servidor.',
        'O reconhecimento de fala do navegador ou do Android, como explicado acima.',
        'Sentry: quando está ativo, recebe relatórios de erro do App e do servidor para a gente corrigir falhas. Os relatórios saem com os dados pessoais removidos tanto quanto possível (usuário, cookies, cabeçalhos e IP).',
        'Esses serviços (Cloudflare, Render, MongoDB Atlas e Sentry) ficam fora do Brasil: o servidor e o banco ficam nos Estados Unidos. Por isso, os dados que passam por eles têm uma transferência internacional.',
        'O Fluveny não vende seus dados e não os usa para publicidade. Ele só os compartilha com os serviços listados aqui, para o Fluveny funcionar.',
      ],
    },
    {
      title: 'Seus direitos',
      paragraphs: [
        'Pela Lei Geral de Proteção de Dados (LGPD, art. 18), você tem direito a confirmar se tratamos dados seus, acessar esses dados, corrigi-los, pedir a anonimização, o bloqueio ou a eliminação de dados desnecessários ou tratados em desacordo com a lei, pedir a portabilidade, pedir que sejam apagados, saber com quem são compartilhados, saber o que acontece se você não der o consentimento, revogar o consentimento e se opor a um tratamento. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).',
        'A base legal de cada tratamento e as regras para dados de crianças e adolescentes (LGPD, art. 14) entram na versão final desta política.',
        'Os dados do modo Visitante ficam quase todos no seu aparelho, e você mesmo pode apagá-los, como explicado abaixo. O canal para pedir o resto entra na versão final desta política, junto com o controlador.',
      ],
    },
    {
      title: 'Como apagar os dados do aparelho',
      paragraphs: [
        'No site: limpe os dados do site do Fluveny nas configurações do navegador (cookies e dados de sites).',
        'No App Android: abra as Configurações do aparelho, vá em Apps, Fluveny, Armazenamento e toque em Limpar dados. Desinstalar o App também apaga os dados.',
        'Depois disso, o Fluveny começa do zero, com um identificador novo. As tentativas guardadas no servidor com o identificador antigo não ficam mais ligadas ao aparelho e são apagadas no prazo de até 90 dias.',
      ],
    },
    {
      title: 'Mudanças nesta política',
      paragraphs: [
        'Esta política muda quando o Fluveny passar a tratar outros dados (por exemplo, quando chegar o cadastro) e quando sair a versão final. Cada versão traz o número e a data no topo.',
      ],
    },
  ],
};
