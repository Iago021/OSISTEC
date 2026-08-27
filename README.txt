OSISTEC — PROTÓTIPO LOCAL EM HTML

COMO ABRIR
1. Sirva a pasta com: python3 -m http.server 8000
2. Abra http://localhost:8000
3. Crie uma conta local como paciente ou médico.

PERFIS
- Paciente: Mapa e Farmácia.
- Médico: Plantões, Mapa e Farmácia.

FUNCIONALIDADES
- Cadastro, login persistente, recuperação local de senha e perfil.
- Sair e excluir conta.
- Senha derivada com PBKDF2/SHA-256 e salt antes do armazenamento.
- Mapa sempre centralizado em Mogi Guaçu.
- Busca por fala ou texto e indicação demonstrativa de unidade não lotada.
- Rota no mapa, check-in, farmácia, reserva e candidatura a plantões.
- Dados de cada conta separados no navegador.

IMPORTANTE
Não use dados reais. Não há servidor, validação oficial de CRM, prontuário ou integração com hospitais. Lotação, espera, preços, estoques, vagas e ações são fictícios. Limpar os dados do navegador remove todas as contas locais.
