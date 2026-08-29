# OSISTEC

Protótipo mobile em HTML, CSS e JavaScript para pacientes e médicos em Mogi Guaçu (SP).

## Acesso e perfis

- É necessário criar uma conta local escolhendo **Paciente** ou **Médico**.
- O paciente acessa **Mapa**, **Farmácia** e **Meus registros**.
- O médico acessa **Plantões**, **Mapa**, **Farmácia** e **Meus registros**.
- A conta, o perfil e as ações demonstrativas ficam apenas no navegador deste aparelho.
- A senha não é salva em texto: o navegador usa PBKDF2 e SHA-256 com salt. Ainda assim, esta autenticação local é apenas para protótipo e não substitui um servidor seguro.
- Há recuperação local de senha, edição de perfil, sair da conta e exclusão da conta.
- A aba **Meus registros** reúne os medicamentos reservados e, para médicos, os plantões escolhidos. As escolhas podem ser canceladas na própria aba.
- Os campos de senha permitem alternar entre mostrar e ocultar o conteúdo digitado.
- Erros de cadastro aparecem junto ao botão **Criar minha conta**.
- O botão de notificações abre uma central com reservas, plantões, check-ins e atualizações não lidas.
- O botão **Mapa** permanece centralizado na navegação inferior.

## Apresentação no computador

Em telas maiores, o aplicativo é exibido em uma moldura centralizada de celular, com 430 px de largura. Isso mantém a mesma navegação mobile no computador e facilita demonstrações em projetor ou compartilhamento de tela.

## Mapa principal

1. O aplicativo abre sempre no mapa centralizado em Mogi Guaçu.
2. A pessoa fala ou digita o que está sentindo.
3. O protótipo classifica a necessidade informada sem realizar diagnóstico.
4. Entre as unidades compatíveis, elimina as marcadas como lotadas e indica a opção mais próxima.
5. A rota é desenhada automaticamente a partir do centro de Mogi Guaçu. O botão **Abrir no GPS** continua a navegação no Google Maps.

## Área médica

A aba Plantões aparece exclusivamente para contas cadastradas como médico. CRM, especialidade, vagas e candidaturas têm caráter demonstrativo; não existe consulta a conselho profissional ou envio para hospitais.

## Dados e limites

- A localização das unidades é consultada no OpenStreetMap quando a internet está disponível.
- Lotação, espera, estoques, preços, reservas, check-ins, plantões e candidaturas são demonstrativos.
- Se a consulta de unidades falhar, o app usa unidades fictícias próximas ao centro de Mogi Guaçu.
- O app não faz diagnóstico, não armazena prontuário e não substitui orientação profissional.
- Como não há backend, limpar os dados do navegador remove as contas e os registros locais.

## Como abrir

Sirva a pasta por HTTP para que o login criptografado, o mapa, o PWA e o microfone funcionem corretamente:

```bash
python3 -m http.server 8000
```

Depois, abra `http://localhost:8000`. Em produção estática, o projeto pode ser publicado pelo GitHub Pages com HTTPS.
