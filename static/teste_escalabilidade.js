/*
 * Teste isolado de escalabilidade das operações sobre linhas da plataforma VA.
 * Sem alterações a allRows, filteredRows, ficheiros CSV ou DOM da aplicação.
 * Registos > conjunto real são cópias sintéticas apenas em memória.
 * Mede FILTRAGEM + AGREGAÇÃO representativas, NÃO renderização das vistas.
 */
(async function () {
  'use strict';
  if (typeof allRows === 'undefined' || !Array.isArray(allRows) || allRows.length === 0) {
    console.error('Teste não iniciado: abre Analytics e confirma que os dados estão carregados.');
    return;
  }
  if (window.__vaEscalabilidadeEmCurso) {
    console.warn('Já existe um teste em execução.');
    return;
  }
  window.__vaEscalabilidadeEmCurso = true;
  const base = allRows.slice(); // não modificar dados de produção
  const tamanhos = [50, 100, 200, base.length, base.length * 2, base.length * 4, base.length * 8]
    .filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
  const datasetReferencia = base[0].Dataset;
  const repeticoesPorLote = 200;
  const lotes = 9;
  const aquecimento = 4;
  const median = xs => [...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
  const format = n => n.toFixed(4);
  function preparar(n) {
    const resultado = [];
    for (let i=0;i<n;i++) {
      const original = base[i % base.length];
      const copia = {...original};
      if (i >= base.length) {
        // Id artificial impede que os duplicados pareçam o mesmo paciente.
        copia.Patient_ID = `${original.Patient_ID}__SINTETICO_${Math.floor(i/base.length)}`;
      }
      resultado.push(copia);
    }
    return resultado;
  }
  function operacao(linhas) {
    // Igual ao padrão de filtragem em applyFilters(): uma passagem pelas linhas,
    // com comparação por dataset; sem desenhar os gráficos.
    const filtradas = linhas.filter(r => r.Dataset === datasetReferencia);
    // Agregação representativa de casos e área ROI, em memória.
    const grupos = new Map();
    for (const r of filtradas) {
      const k = `${r.Dataset}||${r.Patient_ID}||${r.Study_ID}`;
      const anterior = grupos.get(k) || {n:0, area:0};
      anterior.n += 1;
      anterior.area += Number(r.roiArea) || 0;
      grupos.set(k, anterior);
    }
    return filtradas.length + grupos.size;
  }
  function medirLote(linhas) {
    let checksum = 0;
    const inicio = performance.now();
    for (let i=0; i<repeticoesPorLote; i++) checksum += operacao(linhas);
    const totalMs = performance.now() - inicio;
    if (!Number.isFinite(checksum)) throw new Error('Falha no cálculo do checksum');
    return totalMs / repeticoesPorLote;
  }
  try {
    console.log(`Escalabilidade VA — ${base.length} linhas reais; dataset de referência: ${datasetReferencia}`);
    console.log('Testam-se filtragem + agregação em memória, não renderização nem rede. Linhas adicionais são sintéticas.');
    const resultados = [];
    for (const n of tamanhos) {
      const linhas = preparar(n);
      for (let a=0;a<aquecimento;a++) medirLote(linhas);
      const tempos = [];
      for (let b=0;b<lotes;b++) tempos.push(medirLote(linhas));
      resultados.push({
        registos:n,
        origem:n<=base.length?'real (subconjunto)':'replicado sinteticamente',
        mediana_ms:Number(median(tempos).toFixed(4)),
        minimo_ms:Number(Math.min(...tempos).toFixed(4)),
        maximo_ms:Number(Math.max(...tempos).toFixed(4)),
        lotes,
        repeticoes_por_lote:repeticoesPorLote
      });
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    console.table(resultados);
    const cols = ['registos','origem','mediana_ms','minimo_ms','maximo_ms','lotes','repeticoes_por_lote'];
    const csv = [cols.join(';'), ...resultados.map(r=>cols.map(c=>String(r[c]).replace(/;/g,',')).join(';'))].join('\n')+'\n';
    const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download='resultados_escalabilidade.csv'; a.style.display='none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),15000);
    console.info('Teste concluído. Foi criado o ficheiro resultados_escalabilidade.csv em Descargas.');
  } catch(e) {
    console.error('Erro durante teste de escalabilidade:',e);
  } finally {
    window.__vaEscalabilidadeEmCurso=false;
  }
})();
