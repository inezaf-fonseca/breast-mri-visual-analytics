# Plataforma de Visual Analytics

Protótipo desenvolvido no âmbito de uma dissertação de Mestrado em Engenharia Biomédica, destinado à exploração e interpretação dos resultados de um pipeline de deteção de lesões e classificação de subtipos moleculares do cancro da mama em imagens de ressonância magnética.

## Requisitos

- Python 3.10 ou superior
- Flask e Pillow (instalados através do ficheiro `requirements.txt`)
- Navegador web atualizado

## Instalação e execução

Descarregar o código-fonte através da opção **Code → Download ZIP** do GitHub e extrair o ficheiro, ou clonar o repositório com Git. Depois, abrir um terminal na pasta do projeto, onde se encontram os ficheiros `app.py` e `requirements.txt`.

### Windows (PowerShell)

Criar o ambiente virtual:

```powershell
py -3 -m venv .venv
```

Caso o comando `py` não seja reconhecido, utilizar:

```powershell
python -m venv .venv
```

Instalar as dependências:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Iniciar a aplicação:

```powershell
.\.venv\Scripts\python.exe app.py
```

### Linux e macOS

Criar o ambiente virtual:

```bash
python3 -m venv .venv
```

Instalar as dependências:

```bash
./.venv/bin/python -m pip install -r requirements.txt
```

Iniciar a aplicação:

```bash
./.venv/bin/python app.py
```

### Acesso à plataforma

Após iniciar a aplicação, abrir o navegador e aceder a:

http://127.0.0.1:5000/

Para parar a aplicação, premir `Ctrl + C` no terminal.

**Nota:** Este repositório não inclui as imagens de RM nem os ficheiros de dados dos casos utilizados. As funcionalidades que dependem desses dados exigem a sua obtenção e configuração local; a execução do código, por si só, não garante o funcionamento completo de todas as vistas.

## Funcionalidades

A plataforma encontra-se organizada em três páginas principais:

- **Statistics:** apresentação de indicadores gerais e distribuição dos casos.
- **Pipeline:** visualização das etapas de deteção e classificação.
- **Analytics:** exploração de casos individuais, variação das características das regiões de interesse, reconstrução tridimensional aproximada, comparação de casos e avaliação do desempenho dos classificadores CNN.

A plataforma permite ainda adicionar novos casos através do carregamento de ficheiros CSV e imagens JPEG.

## Nota

A plataforma utiliza resultados previamente produzidos pelo pipeline, não executando os modelos Faster R-CNN e 3D CNN.

Trata-se de um protótipo desenvolvido para fins de investigação, não destinado a diagnóstico ou utilização clínica.


## Dados utilizados e proveniência

A plataforma explora resultados previamente gerados por um *pipeline* de deteção de lesões (Faster R-CNN) e classificação de subtipos moleculares (quatro classificadores binários 3D CNN). **Os modelos não são executados por esta aplicação.** O desenvolvimento do *pipeline* e a implementação desta plataforma são contributos distintos.

O repositório científico subjacente ao *pipeline* integra cinco coleções públicas do [The Cancer Imaging Archive (TCIA)](https://www.cancerimagingarchive.net/):

| Coleção | Página oficial |
| --- | --- |
| Duke Breast Cancer MRI | [Duke-Breast-Cancer-MRI](https://www.cancerimagingarchive.net/collection/duke-breast-cancer-mri/) |
| Breast MRI NACT Pilot | [Breast-MRI-NACT-Pilot](https://www.cancerimagingarchive.net/collection/breast-mri-nact-pilot/) |
| ISPY1 | [ISPY1](https://www.cancerimagingarchive.net/collection/ispy1/) |
| ISPY2 | [ISPY2](https://www.cancerimagingarchive.net/collection/ispy2/) |
| Advanced MRI Breast Lesions | [Advanced-MRI-Breast-Lesions](https://www.cancerimagingarchive.net/collection/advanced-mri-breast-lesions/) |

Este repositório disponibiliza apenas o código-fonte da plataforma e os ficheiros de apoio aos testes técnicos. As imagens de ressonância magnética e os ficheiros de dados dos casos não são disponibilizados neste repositório.

Para demonstrar as funcionalidades da plataforma, foram utilizados quatro casos provenientes de coleções públicas do TCIA:

| ID do caso | Dataset de origem |
| --- | --- |
| ISPY1-1010 | ISPY1 |
| ISPY2-108969 | ISPY2 |
| DUKE-021 | Duke Breast Cancer MRI |
| NACT-35 | Breast MRI NACT Pilot |

A coleção Advanced MRI Breast Lesions integra o repositório científico original, mas não faz parte deste subconjunto de quatro casos utilizado para demonstração.

Para executar as funcionalidades dependentes das imagens, é necessário obter os dados nas respetivas fontes e disponibilizá-los localmente, respeitando as condições de acesso e utilização de cada coleção.

As imagens utilizadas no desenvolvimento do protótipo encontram-se em formato JPEG processado, não correspondendo diretamente aos ficheiros DICOM originais. Os valores de intensidade resultantes do processamento não representam diretamente o sinal de RM original e não devem ser utilizados para inferência fisiológica ou clínica.

## Condições de utilização dos dados

Os dados de imagem e metadados provenientes do TCIA **não são disponibilizados neste repositório** e não passam a ser propriedade da autora da plataforma. A utilização, citação e eventual redistribuição devem respeitar as condições associadas a cada recurso e versão, bem como a [política de utilização do TCIA](https://www.cancerimagingarchive.net/data-usage-policies-and-restrictions/).

- **Duke Breast Cancer MRI:** a coleção indica [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/), com exigência de atribuição e restrição de utilização comercial.
- **ISPY1:** a coleção indica [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), com exigência de atribuição.
- **Breast MRI NACT Pilot:** a coleção principal indica [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), com exigência de atribuição.
- **ISPY2:** os recursos e versões da coleção podem apresentar licenças diferentes (incluindo CC BY 4.0 e CC BY-NC 4.0); deve ser confirmada a licença do conjunto específico que originou os ficheiros utilizados.
- **Advanced MRI Breast Lesions:** a coleção principal indica [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), com exigência de atribuição. Esta coleção não foi utilizada no subconjunto de quatro casos selecionados para demonstração.

As páginas oficiais das coleções fornecem as **citações bibliográficas completas e os DOI** aplicáveis. A referência ao TCIA ou às páginas das coleções neste README não substitui a citação formal exigida em trabalhos académicos. Devem também ser identificadas as transformações efetuadas sobre os dados originais, incluindo a conversão para JPEG e a utilização de *bounding boxes* e metadados processados.

**Nota sobre redistribuição:** este repositório contém o código-fonte da plataforma e um ficheiro com resultados dos testes técnicos. As imagens de RM, os metadados clínicos dos casos e os ficheiros derivados do *pipeline* não são redistribuídos. A proveniência dos dados e os identificadores dos casos utilizados são apresentados apenas para documentação e rastreabilidade. A obtenção e utilização dos dados devem respeitar as condições estabelecidas pelas respetivas fontes.

## Limitações e âmbito de utilização

A plataforma é um protótipo de investigação para **execução local**. Não realiza inferência clínica, não substitui validação com utilizadores e não se destina a diagnóstico médico. A representação 3D das regiões de interesse é aproximada e baseada nas *bounding boxes* disponíveis, não equivalendo a uma segmentação anatómica da lesão. As métricas globais dos classificadores não permitem, por si só, associar previsões individuais a todos os casos ilustrados.

A configuração de desenvolvimento do Flask não deve ser exposta diretamente à Internet; qualquer implantação pública necessita de configuração e revisão de segurança próprias.

## Código-fonte e licenciamento

Este repositório disponibiliza o código da plataforma desenvolvido no âmbito da dissertação. **Não foi escolhida uma licença de software neste repositório.** A ausência de licença explícita não implica autorização geral para reutilização do código. As licenças dos datasets mencionadas acima não se aplicam automaticamente ao código-fonte.
