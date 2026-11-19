// Política de privacidade provisória (1.21). Descreve só o que o código faz hoje:
// o modo Visitante (Épico 1) e o cadastro do Aluno adulto (2.1). Mudou o que o
// App, a API ou o Worker tratam: mude este texto, a versão (`versions.ts`) e a
// data no mesmo PR.
import type { LegalDocument } from './types';
import { PRIVACY_VERSION } from './versions';

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Política de privacidade',
  version: PRIVACY_VERSION,
  date: '2026-11-19',
  sections: [
    {
      title: 'Sobre esta política',
      paragraphs: [
        'Aqui a gente explica quais dados o Fluveny trata quando você usa o App ou o site sem conta (o modo Visitante) e quando você cria uma conta, para que servem, onde ficam e com quem passam.',
        'Por enquanto, só quem tem 18 anos ou mais pode criar conta. O Fluveny ainda não envia e-mails, e o seu Progresso continua só no aparelho, mesmo com conta.',
        'O Fluveny é um projeto de extensão da UNIFAL-MG. Quem é o controlador dos dados e qual é o canal de contato para assuntos de privacidade ainda estão sendo definidos com a coordenação do projeto. Os dois entram na versão final desta política.',
      ],
    },
    {
      title: 'O que fica no seu aparelho',
      paragraphs: [
        'Um identificador aleatório do aparelho (deviceId), criado e guardado no aparelho na primeira vez que você usa o Fluveny. Ele não tem seu nome nem nada que identifique você diretamente. Ele também vai ao servidor, como explicado abaixo.',
        'Só no aparelho ficam o nome e o país que você digita no Diálogo, o pronome que você escolhe, o seu Progresso (com o resultado e o tempo de estudo de cada Atividade) e o XP, e os recibos das Atividades que você concluiu.',
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
        'Para a equipe medir o uso do Fluveny, o App avisa o servidor quando você abre o Estágio e cada Atividade, só com o deviceId e qual Atividade foi (sem nome, país, respostas, resultado ou tempo). O servidor também registra quando o deviceId conclui o Estágio 1. Cada aviso é gravado com a hora do servidor. O prazo de guarda desses avisos ainda está sendo definido e entra na versão final desta política.',
        'O servidor guarda a primeira tentativa de cada Atividade (com o deviceId, o resultado, o XP e o tempo de estudo, mas sem a resposta) por até 90 dias. Depois disso, ela é apagada.',
      ],
    },
    {
      title: 'Quando você cria uma conta',
      paragraphs: [
        'No cadastro, o Fluveny pede o seu e-mail, uma senha e a sua data de nascimento, e você pode dizer como quer ser chamado. Logo depois, você pode escolher os pronomes que o Alex usa nas histórias (she/her, he/him ou they/them); sem escolha, vale they/them.',
        'Esses dados ficam no nosso servidor, na sua conta. A senha nunca é guardada como você digitou: o servidor guarda só um resumo dela (hash), que não dá para desfazer. A data de nascimento serve para conferir a idade mínima.',
        'A conta também guarda a versão destes termos e da Política de privacidade que você aceitou e a data do aceite.',
        'Para você continuar conectado, o servidor cria uma sessão, que vale 30 dias e se renova enquanto você usa o Fluveny. No site, ela fica num cookie que o próprio navegador guarda e que o código do site não consegue ler (HttpOnly). No App Android, ela fica no armazenamento seguro do aparelho. O servidor guarda só um resumo (hash) da sessão, que ele apaga quando ela vence.',
        'Quando a conta é criada, o servidor registra esse fato para a equipe medir o uso, com a hora do servidor e um identificador aleatório da conta, sem e-mail, nome, data de nascimento ou qualquer outro dado pessoal.',
        'O nome e o pronome da conta aparecem nas Atividades no lugar dos do modo Visitante. O nome e o país que você digita no Diálogo, o seu Progresso e o XP continuam só no aparelho, como no modo Visitante.',
        'Ainda não dá para mudar os dados nem apagar a conta pelo App. O canal para pedir isso entra na versão final desta política, junto com o controlador.',
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
        'Os dados do modo Visitante ficam quase todos no seu aparelho, e você mesmo pode apagá-los, como explicado abaixo. Os dados da conta ficam no servidor. O canal para pedir o resto entra na versão final desta política, junto com o controlador.',
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
        'Esta política muda quando o Fluveny passar a tratar outros dados (por exemplo, quando o Progresso passar a ser salvo na conta) e quando sair a versão final. Cada versão traz o número e a data no topo.',
      ],
    },
  ],
};
