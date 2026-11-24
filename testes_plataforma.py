"""Testes técnicos locais para o protótipo de Visual Analytics.
Executar na pasta do projeto: python testes_plataforma.py
Não modifica dados nem envia dados para a Internet.
"""
import csv, io, json, os, statistics, sys, time
from datetime import datetime, timezone
from pathlib import Path

from app import app, MEDIA_DIR

REPETICOES = 7
DEST = Path(__file__).parent / 'resultados_testes.csv'
ENDPOINTS = [
    ('Página Statistics', '/'),
    ('Página Pipeline', '/pipeline'),
    ('Página Analytics', '/analytics'),
    ('Adicionar Dados', '/analytics/upload'),
    ('API de datasets', '/api/datasets'),
    ('API de métricas', '/api/model-metrics'),
    ('API de casos importados', '/api/uploaded-cases'),
]

def medir(cliente, designacao, caminho):
    tempos=[]; estados=[]; tamanhos=[]
    for i in range(REPETICOES + 1):  # primeira medição = aquecimento
        t0=time.perf_counter()
        resposta=cliente.get(caminho)
        elapsed=(time.perf_counter()-t0)*1000
        if i:
            tempos.append(elapsed); estados.append(resposta.status_code)
            tamanhos.append(len(resposta.data))
    return dict(teste=designacao, caminho=caminho, repeticoes=REPETICOES,
        status=','.join(str(s) for s in sorted(set(estados))),
        mediana_ms=round(statistics.median(tempos),3),
        minimo_ms=round(min(tempos),3),maximo_ms=round(max(tempos),3),
        bytes_resposta=statistics.median(tamanhos),
        resultado='PASSA' if all(s==200 for s in estados) else 'FALHA')

def main():
    resultados=[]
    with app.test_client() as cliente:
        for nome,url in ENDPOINTS:
            resultados.append(medir(cliente,nome,url))
        resultado = cliente.post('/api/upload-case', data={}, content_type='multipart/form-data')
        resultados.append(dict(teste='Importação sem CSV (validação negativa)',caminho='POST /api/upload-case',
            repeticoes=1,status=str(resultado.status_code),mediana_ms='',minimo_ms='',maximo_ms='',
            bytes_resposta=len(resultado.data),resultado='PASSA' if resultado.status_code==400 else 'FALHA'))
        datasets = cliente.get('/api/datasets').get_json() or []
        for i,d in enumerate(datasets,1):
            csv_url=d.get('csv')
            if csv_url:
                resultados.append(medir(cliente,f'CSV conjunto {i}',csv_url))
        # Exemplo de imagem existente, não verifica todas as imagens.
        for pasta,dirs,files in os.walk(MEDIA_DIR):
            imgs=[f for f in files if f.lower().endswith(('.jpg','.jpeg'))]
            if imgs:
                caminho='/media/'+os.path.relpath(os.path.join(pasta,imgs[0]),MEDIA_DIR).replace(os.sep,'/')
                resultados.append(medir(cliente,'Uma imagem JPEG',caminho))
                break
    with DEST.open('w',newline='',encoding='utf-8-sig') as f:
        writer=csv.DictWriter(f,fieldnames=list(resultados[0]));writer.writeheader();writer.writerows(resultados)
    print('Data UTC:',datetime.now(timezone.utc).isoformat())
    print('Ambiente Python:',sys.version.split()[0]); print('Repetições por endpoint:',REPETICOES)
    for r in resultados:
        print(f"{r['resultado']:5} {r['teste']:<42} HTTP {r['status']:<5} mediana={r['mediana_ms']} ms")
    print('Ficheiro:',DEST)
    print('\nNOTA: Medições internas do Flask test_client; não incluem browser, rede ou renderização JavaScript.')

if __name__=='__main__':main()
