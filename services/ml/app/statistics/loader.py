"""Chargement des tirages VALID en DataFrames pandas.

Ordre chronologique : (draw_date, code du type de tirage) — l'ordre
intra-journée est approximé (horaires non fiables en base), impact
marginal sur les retards, documenté dans docs/03.

Séquence par ensemble : pour les statistiques MACHINE, la séquence est
constituée des seuls tirages possédant un ensemble machine.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import pandas as pd
from sqlalchemy import select

from app.core.db import get_engine, table

GAME_CODE = "loto-bonheur"


@dataclass
class GameConfig:
    game_id: str
    set_types: dict[str, dict]  # code -> {id, numbers_count, number_min, number_max}
    draw_types: dict[str, str]  # id(str) -> code


@dataclass
class LoadedData:
    config: GameConfig
    # Par code d'ensemble : DataFrame trié chronologiquement avec colonnes
    # draw_id, draw_date, draw_type_id, type_code, numbers (list[int])
    sequences: dict[str, pd.DataFrame]
    last_draw_id: str | None  # dernier tirage VALID global (as_of)


def load_config() -> GameConfig:
    games = table("core", "games")
    set_types = table("core", "game_number_set_types")
    draw_types = table("core", "draw_types")
    with get_engine().connect() as conn:
        game_id = conn.execute(select(games.c.id).where(games.c.code == GAME_CODE)).scalar_one()
        sets = {
            row.code: {
                "id": str(row.id),
                "numbers_count": row.numbers_count,
                "number_min": row.number_min,
                "number_max": row.number_max,
            }
            for row in conn.execute(
                select(set_types.c.id, set_types.c.code, set_types.c.numbers_count,
                       set_types.c.number_min, set_types.c.number_max)
                .where(set_types.c.game_id == game_id)
            )
        }
        types = {
            str(row.id): row.code
            for row in conn.execute(
                select(draw_types.c.id, draw_types.c.code).where(draw_types.c.game_id == game_id)
            )
        }
    return GameConfig(game_id=str(game_id), set_types=sets, draw_types=types)


def load_valid_draws(
    config: GameConfig,
    date_from: date | None = None,
    date_to: date | None = None,
) -> LoadedData:
    draws_t = table("core", "draws")
    sets_t = table("core", "draw_number_sets")

    where = (draws_t.c.game_id == config.game_id) & (draws_t.c.status == "VALID")
    if date_from is not None:
        where &= draws_t.c.draw_date >= date_from
    if date_to is not None:
        where &= draws_t.c.draw_date <= date_to

    with get_engine().connect() as conn:
        draws = pd.DataFrame(
            conn.execute(
                select(draws_t.c.id, draws_t.c.draw_date, draws_t.c.draw_type_id).where(where)
            ).all(),
            columns=["draw_id", "draw_date", "draw_type_id"],
        )
        if draws.empty:
            return LoadedData(config=config, sequences={}, last_draw_id=None)
        draw_ids = draws["draw_id"].tolist()
        set_rows = pd.DataFrame(
            conn.execute(
                select(sets_t.c.draw_id, sets_t.c.set_type_id, sets_t.c.numbers)
                .where(sets_t.c.draw_id.in_(draw_ids))
            ).all(),
            columns=["draw_id", "set_type_id", "numbers"],
        )

    draws["draw_id"] = draws["draw_id"].astype(str)
    draws["draw_type_id"] = draws["draw_type_id"].astype(str)
    draws["type_code"] = draws["draw_type_id"].map(config.draw_types)
    draws = draws.sort_values(["draw_date", "type_code"], kind="stable").reset_index(drop=True)
    last_draw_id = draws["draw_id"].iloc[-1]

    set_rows["draw_id"] = set_rows["draw_id"].astype(str)
    set_rows["set_type_id"] = set_rows["set_type_id"].astype(str)
    id_to_code = {v["id"]: code for code, v in config.set_types.items()}
    set_rows["set_code"] = set_rows["set_type_id"].map(id_to_code)

    sequences: dict[str, pd.DataFrame] = {}
    for set_code in config.set_types:
        sub = set_rows[set_rows["set_code"] == set_code][["draw_id", "numbers"]]
        seq = draws.merge(sub, on="draw_id", how="inner")
        seq["numbers"] = seq["numbers"].apply(lambda arr: [int(n) for n in arr])
        sequences[set_code] = seq.reset_index(drop=True)
    return LoadedData(config=config, sequences=sequences, last_draw_id=last_draw_id)
