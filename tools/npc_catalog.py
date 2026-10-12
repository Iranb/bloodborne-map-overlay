"""Curated dialogue NPCs; coordinates always come from local MSBB placements.

Identity checked against NPCParam row labels and dialogue TalkIDs. c9010/c9020
are also used by lamp/menu/message triggers, so these require an entity allowlist.
Do not classify every Enemy or every nonzero TalkID as an NPC.
"""

# NPCParamID: Traditional Chinese label, searchable English name, description.
BY_PARAM = {
    803000: ('人偶', 'Plain Doll', '獵人夢境的升級 NPC。'),
    804000: ('格曼', 'Gehrman', '工廠內的對話形態；最終戰另列於 Boss 圖層。'),
    6040: ('安娜莉絲', 'Annalise, Queen of the Vilebloods', '污穢血族女王。'),
    6060: ('尤瑟夫卡', 'Iosefka', '診所原本的女醫生。'),
    6070: ('假尤瑟夫卡', 'Imposter Iosefka', '診所劇情角色；與原女醫生不會同時在場。'),
    6071: ('假尤瑟夫卡', 'Imposter Iosefka', '診所內的另一劇情階段。'),
    6080: ('疑心重的男子', 'Skeptical Man', '可被引導前往避難所的居民。'),
    6090: ('孤獨老婦', 'Lonely Old Woman', '避難所位置。'),
    6100: ('可疑的乞丐', 'Suspicious Beggar', '劇情 NPC；是否友善取決於事件狀態。'),
    6110: ('亞莉安娜', 'Arianna', '避難所位置。'),
    6113: ('亞莉安娜', 'Arianna', '後續劇情位置。'),
    6140: ('阿黛拉', 'Adella the Nun', '修女；初遇與避難所位置分開記錄。'),
    6150: ('阿爾弗雷德', 'Alfred', '城堡劇情位置。'),
    6151: ('阿爾弗雷德', 'Alfred', '移動後的對話位置。'),
    6155: ('阿爾弗雷德', 'Alfred', '初遇的對話位置。'),
    6160: ('烏鴉獵人艾琳', 'Eileen the Crow', '雅南中部的初遇位置。'),
    6161: ('烏鴉獵人艾琳', 'Eileen the Crow', '教堂病房的劇情位置；不同階段可能移動或敵對。'),
    6300: ('杜拉', 'Djura', '舊雅南的機槍獵人；能否對話取決於接近方式與事件狀態。'),
    6500: ('聯盟大師沃爾特', 'Valtr, Master of the League', '禁忌森林的聯盟 NPC。'),
    6510: ('賽門', 'Simon the Harrowed', 'DLC 劇情角色；各階段位置分開記錄。'),
    6511: ('賽門', 'Simon the Harrowed', '燈塔小屋的劇情位置。'),
    6521: ('布拉多', 'Brador', '地下牢內的本體；入侵分身未列入對話 NPC。'),
    6590: ('浪人山村', 'Yamamura the Wanderer', '地下牢中的劇情角色。'),
    113010: ('歐頓教堂居民', 'Oedon Chapel Dweller', '教堂避難所的接待者。'),
    111010: ('蜘蛛帕奇', 'Patches the Spider', '教學大樓內的位置。'),
    513000: ('威廉大師', 'Master Willem', '拜爾金沃斯湖畔的對話角色。'),
    451100: ('路德維希的頭顱', "Ludwig's Head", '戰鬥後的對話形態；Boss 戰另列。'),
    409000: ('地下屍堆的倖存者', 'Ludwig arena survivor', '路德維希場地內的對話角色。'),
    402300: ('阿黛琳', 'Adeline', '研究大廳的劇情 NPC。'),
    402290: ('阿黛琳', 'Adeline', '後續劇情形態與位置。'),
    402080: ('研究大廳病患', 'Research Hall Patient', '具有對話的病患；不包含一般敵人。'),
    402090: ('研究大廳病患', 'Research Hall Patient', '具有對話的病患；不包含一般敵人。'),
    402280: ('研究大廳病患頭顱', 'Research Hall Patient Head', '具有對話的病患頭顱。'),
    402281: ('研究大廳病患頭顱', 'Research Hall Patient Head', '具有對話的病患頭顱。'),
    452090: ('瑪麗亞', 'Lady Maria', '戰鬥前的劇情互動位置；Boss 戰另列。'),
    405100: ('漁村祭司', 'Fishing Hamlet Priest', '漁村入口的遊走對話角色。'),
}

# Invisible dialogue proxies behind doors/windows, and useful messenger NPCs.
BY_ENTITY = {
    2100211: ('浴池信使商店', 'Bath Messengers', '以血之回響購物的信使。'),
    2100219: ('靈視信使商店', 'Insight Bath Messengers', '以靈視購物的信使。'),
    2100218: ('樹樁信使', 'Stump Messengers', '更換信使裝飾的互動位置。'),
    2410780: ('吉爾伯特', 'Gilbert', '雅南中部燈籠旁的窗戶對話位置。'),
    2410760: ('小女孩／姐姐', "Young Yharnam Girl / Older Sister", '窗戶對話位置；隨劇情階段變化，合併為同一地點。'),
    2410730: ('孤獨老婦', 'Lonely Old Woman', '初遇時的門窗對話位置。'),
    2400752: ('亞莉安娜（住家）', 'Arianna at home', '教堂病房住家門前的對話位置。'),
    2400766: ('疑心重的男子（住家）', 'Skeptical Man at home', '教堂病房住家門前的對話位置。'),
    2400830: ('守門人', 'Password Gatekeeper', '禁忌森林入口的暗號對話位置。'),
}

def collect_npcs(parts, source):
    points = {}
    for p in sorted(parts, key=lambda x: x['EntityID']):
        identity = BY_ENTITY.get(p['EntityID']) or BY_PARAM.get(p['npc'])
        if identity is None or p['talk'] <= 0 or p['EntityID'] < 0:
            continue
        name, en, note = identity
        # Several quest-state actors share exactly one location. Preserve all
        # provenance IDs while showing one marker at that location.
        key = (name, *(round(v, 2) for v in p['p']))
        if key in points:
            points[key]['entities'].append(p['EntityID'])
            points[key]['talkIds'].append(p['talk'])
            continue
        points[key] = dict(name=name, en=en, p=p['p'], entity=p['EntityID'],
                           entities=[p['EntityID']], talkIds=[p['talk']],
                           source=source, note=note + ' 此為地圖配置的初始／劇情候選位置，不表示目前在場；完成狀態手動記錄。')
    return list(points.values())
