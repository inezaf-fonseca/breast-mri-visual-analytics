

"""Resultados da validação externa dos classificadores 3D CNN (OvA).

Fonte: João Pedro Pereira Fontes, tese de doutoramento (2026),
Tabelas 6 (métricas) e 7 (matrizes de confusão).
Configuração: treino exclusivo no Duke Breast Cancer MRI, normalização
por percentis, validação externa ULSA Setúbal (n=98).

Estes são resultados de uma avaliação diferente da publicada no artigo
com normalização por intervalo fixo.
"""

MODEL_METRICS = {
    "subtypes": {
        "Luminal A": {
            "accuracy": 0.8878,
            "precision": 0.8095,
            "recall": 0.9189,
            "auc": 0.9610,
            "f1": 0.8608,
            "tp": 34,
            "fn": 3,
            "fp": 8,
            "tn": 53
        },
        "Luminal B": {
            "accuracy": 0.8673,
            "precision": 0.8387,
            "recall": 0.7647,
            "auc": 0.9205,
            "f1": 0.8000,
            "tp": 26,
            "fn": 8,
            "fp": 5,
            "tn": 59
        },
        "HER2-enriched": {
            "accuracy": 0.9796,
            "precision": 1.0000,
            "recall": 0.7778,
            "auc": 0.9788,
            "f1": 0.8750,
            "tp": 7,
            "fn": 2,
            "fp": 0,
            "tn": 89
        },
        "Triple Negative": {
            "accuracy": 0.8980,
            "precision": 0.7222,
            "recall": 0.7222,
            "auc": 0.9229,
            "f1": 0.7222,
            "tp": 13,
            "fn": 5,
            "fp": 5,
            "tn": 75
        }
    }
}

# Métricas adicionais calculadas a partir das matrizes binárias da Tabela 7.
# Não se trata de novas previsões nem de novas avaliações dos modelos.
for _metrics in MODEL_METRICS["subtypes"].values():
    _tp, _tn = _metrics["tp"], _metrics["tn"]
    _fp, _fn = _metrics["fp"], _metrics["fn"]

    _sensitivity = _tp / (_tp + _fn) if (_tp + _fn) else 0.0
    _specificity = _tn / (_tn + _fp) if (_tn + _fp) else 0.0
    _metrics["specificity"] = round(_specificity, 4)
    _metrics["balanced_accuracy"] = round((_sensitivity + _specificity) / 2, 4)

    _mcc_denominator = ((_tp + _fp) * (_tp + _fn) *
                        (_tn + _fp) * (_tn + _fn)) ** 0.5
    _metrics["mcc"] = round(
        ((_tp * _tn) - (_fp * _fn)) / _mcc_denominator, 4
    ) if _mcc_denominator else 0.0
