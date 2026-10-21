/* PetHora (cliente) — configuração
   Cole a "Project URL" e a chave "anon public" do Supabase (Project Settings > API).
   Use as MESMAS chaves nos dois sites (cliente e painel).
   Deixando vazio, o site abre no MODO DEMONSTRAÇÃO (dados só no navegador). */
window.PETHORA_CONFIG = {
  supabaseUrl: 'https://rmxlqjfekopghsjexbil.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJteGxxamZla29wZ2hzamV4YmlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTc4MDQsImV4cCI6MjEwODE3MzgwNH0.Cyz-oplsCicf0W8cqug2XXa-BTnJPYHGXaby0ncAnSA',
  homeShop: ''        // opcional: slug de um petshop para abrir direto no endereço principal
};
