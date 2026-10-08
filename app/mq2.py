"""Conversion de la lecture brute du MQ-2 (0-1023) en ppm de gaz combustible (courbe GPL de la fiche technique).

Chaîne : lecture brute → tension sur A0 → tension de sortie du capteur (pont diviseur 10 kΩ / 20 kΩ)
→ résistance du capteur Rs → rapport Rs/R0 → ppm.
R0 est la résistance du capteur dans l'air propre : on la mesure une fois, capteur préchauffé
(GET /api/v1/mq2/calibration), puis on la met dans MQ2_R0_KOHM. Sans R0, aucune valeur en ppm n'est donnée.

Variables d'environnement (valeurs par défaut = câblage du boîtier) :
  MQ2_R0_KOHM   résistance dans l'air propre, en kΩ (obligatoire pour obtenir des ppm)
  MQ2_RL_KOHM   résistance de charge du module (1 kΩ sur les modules MQ-2 courants)
  MQ2_DIVIDER   rapport du pont diviseur avant A0 : (10 k + 20 k) / 20 k = 1,5
  MQ2_VCC       alimentation du capteur (5 V)
  ADC_VREF      tension pleine échelle de A0 sur le NodeMCU (3,3 V)
"""
import math
import os

R0_KOHM = float(os.getenv("MQ2_R0_KOHM", "0") or 0)
RL_KOHM = float(os.getenv("MQ2_RL_KOHM", "1.0"))
DIVIDER = float(os.getenv("MQ2_DIVIDER", "1.5"))
VCC = float(os.getenv("MQ2_VCC", "5.0"))
ADC_VREF = float(os.getenv("ADC_VREF", "3.3"))
ADC_MAX = 1023
CLEAN_AIR_RATIO = 9.83              # Rs/R0 dans l'air propre (fiche technique MQ-2)
# Courbe GPL de la fiche technique, en log-log : passe par (200 ppm ; Rs/R0 = 1,62), pente -0,47
CURVE_LOG_PPM, CURVE_LOG_RATIO, CURVE_SLOPE = 2.3, 0.21, -0.47


def sensor_resistance_kohm(raw: float) -> float | None:
    """Résistance du capteur en kΩ, ou None si la lecture est hors plage."""
    if raw is None or raw <= 0:
        return None
    vout = raw / ADC_MAX * ADC_VREF * DIVIDER
    if not 0 < vout < VCC:
        return None
    return RL_KOHM * (VCC - vout) / vout


def ppm(raw: float) -> float | None:
    """Concentration estimée en ppm (équivalent GPL), ou None sans calibration ou lecture invalide."""
    rs = sensor_resistance_kohm(raw)
    if rs is None or R0_KOHM <= 0:
        return None
    log_ratio = math.log10(rs / R0_KOHM)
    return round(10 ** ((log_ratio - CURVE_LOG_RATIO) / CURVE_SLOPE + CURVE_LOG_PPM), 2)


def r0_from_clean_air(raw_mean: float) -> float | None:
    """R0 en kΩ à partir de la lecture moyenne dans l'air propre (capteur préchauffé)."""
    rs = sensor_resistance_kohm(raw_mean)
    return round(rs / CLEAN_AIR_RATIO, 3) if rs else None
