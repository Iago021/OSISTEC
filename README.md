# OSISTEC

Protótipo mobile em HTML, CSS e JavaScript para localizar atendimento de saúde próximo.

## Como funciona

1. A tela principal abre o mapa sempre centralizado em Mogi Guaçu (SP).
2. A pessoa toca no microfone e descreve o que está sentindo. Também existe uma busca por texto para acessibilidade e navegadores sem reconhecimento de voz.
3. O protótipo classifica a necessidade informada sem realizar diagnóstico.
4. Entre as unidades compatíveis, elimina as marcadas como lotadas e indica a mais próxima.
5. A rota é desenhada no mapa automaticamente a partir do centro de Mogi Guaçu, com distância e tempo estimados. O botão **Abrir no GPS** continua a navegação no Google Maps usando a localização do aparelho.

As abas laterais mantêm os exemplos de plantões profissionais e consulta de medicamentos.

## Dados e limites do protótipo

- A localização das unidades de Mogi Guaçu é consultada no OpenStreetMap quando a internet está disponível.
- A lotação, o tempo de espera, os plantões, os estoques, os preços, as reservas e os check-ins são dados demonstrativos.
- Se a consulta de unidades falhar, o app usa unidades fictícias próximas ao centro de Mogi Guaçu para demonstrar o fluxo.
- O app não faz diagnóstico nem substitui orientação profissional.

## Publicação

O projeto é estático e pode ser publicado diretamente pelo GitHub Pages. O microfone exige uma origem segura (`https://`) e a permissão da pessoa usuária.

Para abrir localmente, sirva a pasta com um servidor HTTP. Exemplo:

```bash
python3 -m http.server 8000
```

Depois, abra `http://localhost:8000`. A busca por voz depende do suporte do navegador; Chrome e Edge costumam oferecer a melhor compatibilidade, enquanto a busca digitada funciona como alternativa.
