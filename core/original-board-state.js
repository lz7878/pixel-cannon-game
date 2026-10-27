// 原包棋盘状态机（原样移植，勿改算法）
//
// 来源：taxi-pick/src/core/original-board-state.ts
// 上游：original/libs/game.pretty.js 中 BoardState 的逐行提取。
// 负责“选中哪些色块 / 以什么顺序预约 / 何时可以穿过缝隙”的全部判定：
//   - rebuildFrontier / isExposed：外露空气判定，决定哪些格子此刻真的可达；
//   - selectTargetCandidate：按炮台出发的真实路径距离挑锚点（A* 搜索）；
//   - tryReservePeelTargets：同色 peel 焦点，沿连通组逐格剥开；
//   - commitReservations：提交后立刻把格子写成空并刷新外露空气。
// 方法名与局部变量名保留了原包的混淆形态，是为了和上游实现逐字对照；
// 唯一的外部依赖是下面的 Laya.Vector3 垫片。
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  static distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
}
const Laya = { Vector3 };
const l = class {
            constructor() {
                this.grid = [], this.sourceColorMap = [], this.sourceScriptMap = [], this.frontierByColor = {}, this.frontierKeysByColor = {}, this.futureFrontierByColor = {}, this.futureFrontierKeysByColor = {}, this.futureReadyTimeByKey = {}, this.predictedClearTimeByKey = {}, this.futureFrontierDirty = !0, this.reservations = {}, this.reservedCellIds = new Set, this.reservationRevision = 0, this.diagnostics = null, this.reservationSeed = 0, this.peelFocusSeed = 0, this.rowWorldZ = [], this.colWorldX = [], this.rowStep = 1, this.colStep = 1, this.columnCount = 0, this.blackHolePathCell = null, this.blackHoleAvoidRadiusCells = 1, this.blackHoleStartSegmentMarginScale = .2, this.exteriorAirKeys = {}, this.exteriorAirDirty = !0, this.futureExteriorAirKeys = {}, this.futureExteriorAirDirty = !0, this.boardWallEnabled = !1, this.boundaryExitConfig = {
                    minOpeningCells: 2
                }, this.predictionBufferMs = 80, this.defaultAntSpeed = 14.5, this.pathWorldY = .8, this.bottomPathExtraRows = 6, this.cubeApproachDistanceScale = 1.08, this.antClearanceDistanceScale = .62, this.antSideClearancePenalty = 2.8, this.antDiagonalClearancePenalty = .75, this.antTightPassagePenalty = 4.5, this.maxPathSearchCandidateCount = 8, this.maxReadOnlyPathSearchCandidateCount = 2, this.maxPeelFocusConnectionDepth = 48, this.maxPeelFocusExitDistance = 3, this.peelFocusCorridorTailCount = 9, this.candidateChoiceSearchMultiplier = 2, this.maxPeelFocusPathSearchCandidateCount = 24, this.actualPathSearchVersion = 0, this.futurePathSearchVersion = 0, this.actualPathSearchCache = {}, this.actualPathSearchCacheKeys = [], this.futurePathSearchCache = {}, this.futurePathSearchCacheKeys = [], this.maxPathSearchCacheCount = 80, this.noTargetUntilByKey = {}, this.noTargetCooldownMs = 45, this.futureExteriorAirMark = [], this.predictedClearMark = [], this.actualClearancePenaltyMark = [], this.actualClearancePenaltyValue = [], this.futureClearancePenaltyMark = [], this.futureClearancePenaltyValue = [], this.candidateChoiceBuffer = [], this.pathSearchRunId = 0, this.pathOpenMark = [], this.pathClosedMark = [], this.pathScoreMark = [], this.pathDestinationMark = [], this.pathHeapIndex = [], this.pathGScore = [], this.pathFScore = [], this.pathPrevious = [], this.pathOpenOrder = []
            }
            setDiagnostics(a) {
                this.diagnostics = a || null
            }
            build(a, b) {
                let c;
                this.grid = [], this.frontierByColor = {}, this.frontierKeysByColor = {}, this.futureFrontierByColor = {}, this.futureFrontierKeysByColor = {}, this.futureReadyTimeByKey = {}, this.predictedClearTimeByKey = {}, this.resetPredictedClearLookup(), this.futureFrontierDirty = !0, this.reservations = {}, this.reservedCellIds.clear(), this.reservationSeed = 0, this.reservationRevision++, this.peelFocusSeed = 0, this.sourceColorMap = a || [], this.sourceScriptMap = b || [], this.rowWorldZ = [], this.colWorldX = [], this.rowStep = 1, this.colStep = 1, this.columnCount = 0, this.blackHolePathCell = null, this.exteriorAirKeys = {}, this.exteriorAirDirty = !0, this.futureExteriorAirKeys = {}, this.futureExteriorAirMark = [], this.predictedClearMark = [], this.noTargetUntilByKey = {}, this.futureExteriorAirDirty = !0, this.invalidatePathSearchCache();
                c = this.sourceColorMap.length;
                for (let a = 0; a < c; a++) {
                    let b;
                    this.grid[a] = [];
                    b = this.sourceColorMap[a] ? this.sourceColorMap[a].length : 0;
                    b > this.columnCount && (this.columnCount = b);
                    for (let c = 0; c < b; c++) {
                        let b, d, e, f;
                        b = this.asCube(this.sourceScriptMap[a] ? this.sourceScriptMap[a][c] : null), e = Number(this.sourceColorMap[a][c]), f = b ? b.color_rid : e, d = !b || 0 === f || 7e3 === f;
                        if (b && b.sp3 && !b.sp3.destroyed) {
                            let d;
                            d = b.sp3.transform.position;
                            this.rowWorldZ[a] = d.z, this.colWorldX[c] = d.x
                        }
                        this.grid[a][c] = {
                            row: a,
                            col: c,
                            key: this.getKey(a, c),
                            colorRid: f,
                            cube: d ? null : b,
                            state: d ? 0 : 1,
                            reservationId: 0
                        }
                    }
                }
                this.fillAxisValues(this.rowWorldZ, c, 1), this.fillAxisValues(this.colWorldX, this.columnCount, 1), this.rowStep = this.getAxisStep(this.rowWorldZ, 1), this.colStep = this.getAxisStep(this.colWorldX, 1), this.rebuildFrontier()
            }
            setBoardWallEnabled(a) {
                this.boardWallEnabled !== a && (this.boardWallEnabled = a, this.markExteriorAirDirty(), this.markFutureFrontierDirty(), this.grid.length > 0 && this.rebuildFrontier())
            }
            setBoundaryExitConfig(a) {
                let b;
                b = a && isFinite(Number(a.minOpeningCells)) ? Math.max(1, Math.floor(Number(a.minOpeningCells))) : 2;
                this.boundaryExitConfig.minOpeningCells !== b && (this.boundaryExitConfig = {
                    minOpeningCells: b
                }, this.markExteriorAirDirty(), this.markFutureFrontierDirty(), this.grid.length > 0 && this.rebuildFrontier())
            }
            setPathWorldY(a) {
                this.isValidNumber(a) && (this.pathWorldY = a)
            }
            isExposed(a, b) {
                let c;
                c = this.getCell(a, b);
                return !!this.isAliveCell(c) && this.hasReachableExposedFace(a, b)
            }
            tryReserveTarget(a, b, c) {
                let d, e;
                if (!a || a.bulletTotalNum <= 0) return null;
                d = a.color_rid, e = this.selectTargetCandidate(a, d, b || this.defaultAntSpeed, !0, c);
                return this.createReservationFromCandidate(a, e, b || this.defaultAntSpeed)
            }
            tryReservePeelTarget(a, b, c, d = !0) {
                let e;
                e = this.tryReservePeelTargetWithFocus(a, b, c, null, d);
                return e ? e.reservation : null
            }
            tryReservePeelTargets(a, b, c, d, e = [], f) {
                let g, h, i;
                e.length = 0;
                g = Math.max(0, Math.floor(b || 0));
                h = f && f.focus ? f.focus : null, i = f && f.sideLock ? f.sideLock : null;
                for (let b = 0; b < g; b++) {
                    let b, f;
                    f = h ? d : this.maxPeelFocusPathSearchCandidateCount;
                    b = this.tryReservePeelTargetWithFocus(a, c, f, h, !0, i);
                    if (!b && h && (b = this.tryReservePeelTargetWithFocus(a, c, this.maxPeelFocusPathSearchCandidateCount, null, !0, i)), !b && h && i && (b = this.tryReservePeelTargetWithFocus(a, c, this.maxPeelFocusPathSearchCandidateCount, null, !0, null)) && (i = null), !b) break;
                    h = b.focus, !i && h && h.sideHardLock && (i = this.getPeelFocusSideLock(h)), e.push(b.reservation)
                }
                return f && (f.focus = h, f.sideLock = i), e
            }
            tryReservePeelTargetWithFocus(a, b, c, d, e, f = null) {
                let g, h, i, j;
                if (!a || a.bulletTotalNum <= 0) return null;
                g = a.color_rid, j = b || this.defaultAntSpeed;
                d && d.colorRid !== g && (d = null);
                i = null;
                if (d) {
                    let b;
                    b = this.tryReserveConnectedPeelTarget(a, g, j, d, f);
                    if (b) return d.keys.add(this.getKey(b.row, b.col)), {
                        reservation: b,
                        focus: d
                    };
                    if (!e) return null;
                    !f && d.sideHardLock && (f = this.getPeelFocusSideLock(d)), d = null
                }
                if (i) this.isPeelFocusCandidate(d, i.cell) || (d = this.createPeelFocus(g, i, a.bulletTotalNum));
                else {
                    if (!(i = this.selectTargetCandidate(a, g, j, !0, c, null, !0, f))) return null;
                    d = this.createPeelFocus(g, i, a.bulletTotalNum)
                }
                d.keys.add(i.cell.key);
                h = this.createReservationFromCandidate(a, i, j, d);
                return h ? {
                    reservation: h,
                    focus: d
                } : null
            }
            tryReserveConnectedPeelTarget(a, b, c, d, e = null) {
                let f, g, h;
                if (!d || d.colorRid !== b) return null;
                f = this.findNearestConnectedPeelCell(d, b, e);
                if (!f || !f.cell) return null;
                h = this.buildConnectedPeelWorldPath(f.pathCells, d, f.cell);
                if (!h || h.length <= 0) return null;
                g = {
                    cell: f.cell,
                    path: h,
                    isFuture: !1,
                    exitRow: d.exitRow,
                    exitCol: d.exitCol,
                    pathCells: f.pathCells
                };
                return this.removeFrontier(f.cell), this.removeFromFutureFrontier(f.cell), this.createReservationFromCandidate(a, g, c || this.defaultAntSpeed, d)
            }
            findNearestConnectedPeelCell(a, b, c = null) {
                let d, e, f, g, h, i, j, k, l;
                if (!a || a.colorRid !== b) return null;
                l = this.getCell(a.anchorRow, a.anchorCol);
                if (!l || l.colorRid !== b || !this.isCellInsideSideLock(c, l)) return null;
                k = [{
                    cell: l,
                    depth: 0,
                    order: 0
                }], h = {}, j = {}, g = {};
                h[l.key] = 0, j[l.key] = "", g[l.key] = l;
                f = 1, d = null, i = Number.MAX_VALUE, e = Number.MAX_VALUE;
                for (; k.length > 0;) {
                    let b, l, m, n;
                    m = 0;
                    for (let a = 1; a < k.length; a++)(k[a].depth < k[m].depth || k[a].depth === k[m].depth && k[a].order < k[m].order) && (m = a);
                    n = k.splice(m, 1)[0], l = n ? n.cell : null;
                    if (!l || n.depth !== h[l.key] || n.depth > e) continue;
                    if (n.depth > 0 && !a.keys.has(l.key) && this.isPeelFocusSelectableFrontierCell(a, l)) {
                        let b, c, f, g, h;
                        b = Math.abs(l.row - a.anchorRow), c = Math.abs(l.col - a.anchorCol), g = Math.max(b, c), h = this.getPeelFocusLocalSupportScore(a, l), f = 1e4 * n.depth + 100 * g + 1.03 * b + c - 8 * h;
                        f < i && (i = f, e = n.depth, d = l)
                    }
                    b = this.getPeelFocusConnectionNeighbors(a, l, c);
                    for (let d = 0; d < b.length; d++) {
                        let i, m, o, p;
                        i = b[d], o = i ? i.cell : null;
                        if (!o || !this.isCellInsideSideLock(c, o) || !this.isPeelFocusConnectableCell(a, o)) continue;
                        p = n.depth + i.cost;
                        if (p > this.maxPeelFocusConnectionDepth || p > e) continue;
                        m = h[o.key];
                        if (!(this.isValidNumber(m) && m <= p)) {
                            if (h[o.key] = p, g[o.key] = o, i.bridgeCell) {
                                let a;
                                a = i.bridgeKey || "bridge:" + o.key;
                                g[a] = i.bridgeCell, j[a] = l.key, j[o.key] = a
                            } else j[o.key] = l.key;
                            k.push({
                                cell: o,
                                depth: p,
                                order: f++
                            })
                        }
                    }
                }
                return d ? {
                    cell: d,
                    pathCells: this.buildConnectionPathCells(d.key, j, g)
                } : null
            }
            buildConnectionPathCells(a, b, c) {
                let d, e, f;
                e = [];
                d = a, f = 0;
                for (; d && c[d] && f++ < 256;) {
                    let a;
                    a = c[d];
                    e.push({
                        row: a.row,
                        col: a.col
                    }), d = b[d]
                }
                return e
            }
            buildConnectedPeelWorldPath(a, b, c) {
                let d, e, f;
                d = [], e = this.pathCellsToWaypoints(a || [], this.pathWorldY, c);
                for (let a = 0; a < e.length; a++) this.pushWaypointIfChanged(d, e[a]);
                f = b && b.anchorWorldPath ? b.anchorWorldPath : [];
                for (let a = 0; a < f.length; a++) this.pushWaypointIfChanged(d, f[a]);
                return d.length <= 0 && c && this.pushWaypointIfChanged(d, this.getCellCenterWaypoint(c, this.pathWorldY)), d
            }
            getAnchorWorldPathFromCandidate(a) {
                let b, c, d, e;
                if (!a || !a.path || a.path.length <= 0 || !a.cell) return [];
                d = this.getCellCenterWaypoint(a.cell, this.pathWorldY), b = a.path[0], c = a.path[a.path.length - 1], e = [];
                if ((b ? Laya.Vector3.distance(b, d) : Number.MAX_VALUE) <= (c ? Laya.Vector3.distance(c, d) : Number.MAX_VALUE))
                    for (let b = 0; b < a.path.length; b++) e.push(a.path[b].clone());
                else
                    for (let b = a.path.length - 1; b >= 0; b--) e.push(a.path[b].clone());
                return e
            }
            createReservationFromCandidate(a, b, c, d) {
                let e, f, g, h;
                if (!b) return null;
                f = b.cell, e = ++this.reservationSeed;
                f.state = 2, f.reservationId = e, this.reservedCellIds.add(this.getStaticCellId(f.row, f.col));
                g = this.getPredictionReadyTime(a, b.path, c || this.defaultAntSpeed), h = {
                    id: e,
                    row: f.row,
                    col: f.col,
                    colorRid: f.colorRid,
                    cube: f.cube,
                    cannon: a,
                    path: b.path,
                    predictedReadyTime: g
                };
                return d && (h.peelFocusId = d.id, h.peelAnchorRow = d.anchorRow, h.peelAnchorCol = d.anchorCol, h.peelExitRow = d.exitRow, h.peelExitCol = d.exitCol, h.peelIsAnchor = f.row === d.anchorRow && f.col === d.anchorCol, h.peelConnectionDepth = h.peelIsAnchor ? 0 : Math.max(1, b.pathCells ? b.pathCells.length - 1 : 1)), this.reservations[e] = h, this.reservationRevision++, this.addReservationToFutureFrontier(h, f), this.emitReservationDiagnostic("create", "normal", h, b.pathCells), h
            }
            tryReserveReviveTarget(a, b, c, d, e, f, g) {
                let h, i, j, k, l;
                h = this.tryReserveTarget(a, b, c);
                if (h) return h;
                if (!a || a.bulletTotalNum <= 0) return null;
                i = this.findReviveFillCell(a, d, e, f, g);
                if (!i) return null;
                j = this.findPathToCell(a, i, !0) || this.buildReviveFallbackPath(i), k = ++this.reservationSeed;
                i.state = 2, i.reservationId = k, this.reservedCellIds.add(this.getStaticCellId(i.row, i.col)), this.removeFrontier(i), this.removeFromFutureFrontier(i);
                l = {
                    id: k,
                    row: i.row,
                    col: i.col,
                    colorRid: i.colorRid,
                    cube: i.cube,
                    cannon: a,
                    path: j,
                    predictedReadyTime: this.getPredictionReadyTime(a, j, b || this.defaultAntSpeed)
                };
                return this.reservations[k] = l, this.reservationRevision++, this.addReservationToFutureFrontier(l, i), this.emitReservationDiagnostic("create", "revive", l), l
            }
            findReviveFillCell(a, b, c, d, e) {
                let f, g, h;
                if (!a || !this.grid || 0 === this.grid.length) return null;
                g = this.getCannonFirePosition(a);
                f = null, h = Number.MAX_VALUE;
                for (let i = 0; i < this.grid.length; i++) {
                    let j;
                    j = this.grid[i];
                    if (j)
                        for (let i = 0; i < j.length; i++) {
                            let k, l;
                            k = j[i];
                            if (!this.isAliveCell(k) || k.colorRid !== a.color_rid) continue;
                            l = this.getReviveFillCellScore(k, g, b, c, d, e);
                            l < h && (h = l, f = k)
                        }
                }
                return f
            }
            getReviveFillCellScore(a, b, c, d, e, f) {
                let g, h, i;
                i = .35 * a.row;
                g = this.getWorldXForPathCol(a.col), h = this.getWorldZForPathRow(a.row);
                if (b && (i += Math.abs(g - b.x) + Math.abs(h - b.z)), c)
                    for (let b = 0; b < c.length; b++) {
                        let d;
                        d = Math.abs(a.col - c[b]);
                        i += 1.2 * Math.max(0, 2.5 - d)
                    }
                if (d)
                    for (let b = 0; b < d.length; b++) Math.abs(a.row - d[b]) <= 1 && (i += .8);
                if (this.isValidNumber(e) && this.isValidNumber(f) && f > 0) {
                    i += .6 * Math.max(0, Math.abs(a.col - e) - f)
                }
                return i
            }
            buildReviveFallbackPath(a) {
                let b;
                b = [];
                return this.pushWaypointIfChanged(b, this.getCellCenterWaypoint({
                    row: a.row,
                    col: a.col
                }, this.pathWorldY)), b
            }
            hasAvailableTarget(a, b, c) {
                let d;
                if (!a || a.bulletTotalNum <= 0) return !1;
                d = a.color_rid;
                return !!this.selectTargetCandidate(a, d, b || this.defaultAntSpeed, !1, c)
            }
            hasImmediatelyAvailableTarget(a, b, c) {
                let d;
                if (!a || a.bulletTotalNum <= 0) return !1;
                d = a.color_rid;
                return !!this.selectTargetCandidate(a, d, b || this.defaultAntSpeed, !1, c, null, !1, null, !1)
            }
            hasAvailableColor(a) {
                let b, c;
                b = this.frontierByColor[a], c = this.frontierKeysByColor[a];
                if (!b || !c) return !1;
                for (let d = 0; d < b.length; d++) {
                    let e;
                    e = b[d];
                    if (e && c.has(e.key) && this.canReserveCell(e, a)) return !0
                }
                return !1
            }
            getAliveColorCount(a) {
                let b;
                if (!this.grid || this.grid.length <= 0) return 0;
                b = 0;
                for (let c = 0; c < this.grid.length; c++) {
                    let d;
                    d = this.grid[c];
                    if (d)
                        for (let c = 0; c < d.length; c++) {
                            let e;
                            e = d[c];
                            e && e.colorRid === a && this.isAliveCell(e) && b++
                        }
                }
                return b
            }
            getFrontierColorCounts() {
                let a, b;
                b = [], a = Object.keys(this.frontierByColor);
                for (let c = 0; c < a.length; c++) {
                    let d, e;
                    e = Number(a[c]);
                    if (!this.isValidNumber(e)) continue;
                    d = this.getValidActualFrontier(e).length;
                    d <= 0 || b.push({
                        colorRid: e,
                        count: d
                    })
                }
                return b.sort((a, b) => b.count !== a.count ? b.count - a.count : a.colorRid - b.colorRid), b
            }
            getPatternClearableColorCounts() {
                let a, b, c;
                c = {};
                for (let a = 0; a < this.grid.length; a++) {
                    let b;
                    b = this.grid[a];
                    for (let a = 0; a < b.length; a++) {
                        let d;
                        d = b[a];
                        this.isAliveCell(d) && (c[d.colorRid] = !0)
                    }
                }
                a = [], b = Object.keys(c);
                for (let c = 0; c < b.length; c++) {
                    let d, e;
                    d = Number(b[c]), e = this.simulatePatternClearableCount(d);
                    e > 0 && a.push({
                        colorRid: d,
                        count: e
                    })
                }
                return a.sort((a, b) => b.count !== a.count ? b.count - a.count : a.colorRid - b.colorRid), a
            }
            getPatternSimulationContext() {
                return {
                    grid: this.grid,
                    columnCount: this.columnCount,
                    boardWallEnabled: this.boardWallEnabled,
                    minRow: this.getMinPathRow(),
                    maxRow: this.getMaxPathRow(),
                    minCol: this.getMinPathCol(),
                    maxCol: this.getMaxPathCol(),
                    blackHoleRow: this.blackHolePathCell ? this.blackHolePathCell.row : null,
                    blackHoleCol: this.blackHolePathCell ? this.blackHolePathCell.col : null,
                    blackHoleAvoidRadiusCells: this.blackHoleAvoidRadiusCells,
                    searchOffsets: this.getStableSearchOffsets()
                }
            }
            isPatternSimulationAliveCell(a) {
                return this.isAliveCell(a)
            }
            simulatePatternClearableCount(a) {
                let b, c, d;
                b = [], d = [];
                for (let c = 0; c < this.grid.length; c++) {
                    let e;
                    b[c] = [], d[c] = [];
                    e = this.grid[c];
                    for (let f = 0; f < this.columnCount; f++) {
                        let g;
                        g = e ? e[f] : null;
                        b[c][f] = !!g && (1 === g.state || 2 === g.state), d[c][f] = this.isAliveCell(g) && g.colorRid === a
                    }
                }
                c = 0;
                for (;;) {
                    let a, e;
                    a = this.buildSimulatedExteriorAir(b), e = [];
                    for (let c = 0; c < d.length; c++)
                        for (let f = 0; f < d[c].length; f++) d[c][f] && b[c][f] && this.isSimulatedCellExposed(a, c, f) && e.push({
                            row: c,
                            col: f
                        });
                    if (0 === e.length) break;
                    for (let a = 0; a < e.length; a++) {
                        let f;
                        f = e[a];
                        b[f.row][f.col] = !1, d[f.row][f.col] = !1, c++
                    }
                }
                return c
            }
            buildSimulatedExteriorAir(a) {
                let b, c, d, e, f, g, h, i;
                h = {}, f = [], d = this.getMinPathRow(), e = this.getMaxPathRow(), i = this.getMinPathCol(), g = this.getMaxPathCol();
                if (this.boardWallEnabled)
                    for (let b = i; b <= g; b++) this.addSimulatedExteriorAirCell(f, h, a, d, b);
                else {
                    for (let b = i; b <= g; b++) this.addSimulatedExteriorAirCell(f, h, a, d, b), this.addSimulatedExteriorAirCell(f, h, a, e, b);
                    for (let b = d; b <= e; b++) this.addSimulatedExteriorAirCell(f, h, a, b, i), this.addSimulatedExteriorAirCell(f, h, a, b, g)
                }
                b = this.getStableSearchOffsets();
                c = 0;
                for (; c < f.length;) {
                    let d;
                    d = f[c++];
                    for (let c = 0; c < b.length; c++) this.addSimulatedExteriorAirCell(f, h, a, d.row + b[c][0], d.col + b[c][1])
                }
                return h
            }
            addSimulatedExteriorAirCell(a, b, c, d, e) {
                let f;
                if (d < this.getMinPathRow() || d > this.getMaxPathRow() || !this.isPathColInSearchBounds(e)) return;
                if (this.isBlackHolePathCell(d, e) || d >= 0 && d < c.length && c[d][e]) return;
                f = this.getKey(d, e);
                b[f] || (b[f] = !0, a.push({
                    row: d,
                    col: e
                }))
            }
            isSimulatedCellExposed(a, b, c) {
                return !!(a[this.getKey(b - 1, c)] || a[this.getKey(b + 1, c)] || a[this.getKey(b, c - 1)] || a[this.getKey(b, c + 1)])
            }
            getValidActualFrontier(a) {
                let b, c, d;
                b = this.frontierByColor[a], d = this.frontierKeysByColor[a];
                if (!b || !d) return [];
                c = 0;
                for (let e = 0; e < b.length; e++) {
                    let f;
                    f = b[e];
                    f && d.has(f.key) && this.canReserveCell(f, a) ? b[c++] = f : f && d.delete(f.key)
                }
                return b.length = c, b
            }
            getValidFutureFrontier(a) {
                let b, c, d;
                d = this.futureFrontierByColor[a], b = this.futureFrontierKeysByColor[a];
                if (!d || !b) return [];
                c = 0;
                for (let e = 0; e < d.length; e++) {
                    let f, g;
                    f = d[e];
                    if (!f || !b.has(f.key) || !this.canReserveFutureCell(f, a)) {
                        f && b.delete(f.key);
                        continue
                    }
                    g = this.futureReadyTimeByKey[f.key];
                    this.isValidNumber(g) ? d[c++] = f : b.delete(f.key)
                }
                return d.length = c, d
            }
            getPredictionReadyTime(a, b, c) {
                let d, e, f;
                d = this.getCannonFirePosition(a);
                if (!d || !b || 0 === b.length) return this.getNowMs() + this.predictionBufferMs;
                e = this.getWorldPathDistance(d, b), f = Math.max(c || this.defaultAntSpeed, 1e-4);
                return this.getNowMs() + e / f * 1e3 + this.predictionBufferMs
            }
            rebuildFutureFrontier() {
                let a;
                if (!this.futureFrontierDirty) return;
                this.futureFrontierDirty = !1, this.futureFrontierByColor = {}, this.futureFrontierKeysByColor = {}, this.futureReadyTimeByKey = {}, this.predictedClearTimeByKey = {}, this.resetPredictedClearLookup(), this.predictedClearMark = [], this.futureExteriorAirDirty = !0;
                a = Object.keys(this.reservations);
                for (let b = 0; b < a.length; b++) {
                    let c, d;
                    c = this.reservations[a[b]];
                    if (!c) continue;
                    d = this.getCell(c.row, c.col);
                    d && d.reservationId === c.id && 2 === d.state && (this.predictedClearTimeByKey[d.key] = c.predictedReadyTime, this.addPredictedClearLookup(d.row, d.col), this.predictedClearMark[this.getCurrentPathCellId(d.row, d.col)] = this.futurePathSearchVersion, this.addFutureEdgeNeighbors(d, c.predictedReadyTime))
                }
            }
            addReservationToFutureFrontier(a, b) {
                a && b && (this.rebuildFutureFrontier(), this.futureExteriorAirDirty = !0, this.invalidateFuturePathSearchCache(), this.predictedClearTimeByKey[b.key] = a.predictedReadyTime, this.addPredictedClearLookup(b.row, b.col), this.predictedClearMark[this.getCurrentPathCellId(b.row, b.col)] = this.futurePathSearchVersion, this.removeFromFutureFrontier(b), this.addFutureEdgeNeighbors(b, a.predictedReadyTime))
            }
            addFutureEdgeNeighbors(a, b) {
                let c;
                c = this.getStableSearchOffsets();
                for (let d = 0; d < c.length; d++) {
                    let e, f, g, h, i;
                    h = a.row + c[d][0], g = a.col + c[d][1], f = this.getCell(h, g);
                    if (!f || !this.isAliveCell(f)) continue;
                    if (this.isCellInActualFrontier(f) || this.isCellReserved(f)) continue;
                    i = this.futureFrontierByColor[f.colorRid];
                    i || (i = [], this.futureFrontierByColor[f.colorRid] = i);
                    e = this.futureFrontierKeysByColor[f.colorRid];
                    e || (e = new Set, this.futureFrontierKeysByColor[f.colorRid] = e), e.has(f.key) ? (!this.isValidNumber(this.futureReadyTimeByKey[f.key]) || b < this.futureReadyTimeByKey[f.key]) && (this.futureReadyTimeByKey[f.key] = b) : (e.add(f.key), this.futureReadyTimeByKey[f.key] = b, i.push(f))
                }
            }
            selectTargetCandidate(a, b, c, d, e, f = null, g = !1, h = null, i = !0) {
                let j, k, l, m, n, o, p, q, r, s, t;
                this.rebuildFutureFrontier();
                r = this.getCannonFirePosition(a);
                if (!r) return null;
                p = this.getEffectivePathSearchCount(d, e);
                f && d && (p = Math.max(p, this.maxPeelFocusPathSearchCandidateCount));
                q = f ? f.id : 0, o = h && h.sign ? h.sign + ":" + h.minCol + "-" + h.maxCol : "0", k = this.getNoTargetCacheKey(b, r, d, c, p, q) + "|side=" + o;
                if (this.isNoTargetCached(k)) return this.emitCandidateSearchDiagnostic("cache", b, [], null), null;
                s = Math.max(p * this.candidateChoiceSearchMultiplier, p), t = this.candidateChoiceBuffer;
                t.length = 0;
                m = this.getValidActualFrontier(b);
                n = null, j = Number.MAX_VALUE;
                for (let a = 0; a < m.length; a++)
                    if (this.isCellInsideSideLock(h, m[a]))
                        if (!f || this.isPeelFocusCandidate(f, m[a])) this.pushLimitedCandidateChoice(t, m[a], !1, r, s, f);
                        else {
                            let b;
                            b = this.getCandidateEstimateScore(r, m[a]);
                            b < j && (n = m[a], j = b)
                        } this.pushPeelDistanceOverrideChoice(t, n, !1, j, f, r, s);
                l = this.findBestPathCandidate(a, t, c, p, !0, g, f);
                if (this.emitCandidateSearchDiagnostic("actual", b, t, l), !l && i) {
                    let d;
                    t.length = 0;
                    d = this.getValidFutureFrontier(b);
                    n = null, j = Number.MAX_VALUE;
                    for (let a = 0; a < d.length; a++)
                        if (this.isCellInsideSideLock(h, d[a]))
                            if (!f || this.isPeelFocusCandidate(f, d[a])) this.pushLimitedCandidateChoice(t, d[a], !0, r, s, f);
                            else {
                                let b;
                                b = this.getCandidateEstimateScore(r, d[a]);
                                b < j && (n = d[a], j = b)
                            } this.pushPeelDistanceOverrideChoice(t, n, !0, j, f, r, s), l = this.findBestPathCandidate(a, t, c, p, !1, g, f), this.emitCandidateSearchDiagnostic("future", b, t, l)
                }
                return l ? (d && (l.isFuture ? this.removeFromFutureFrontier(l.cell) : this.removeFrontier(l.cell)), t.length = 0, l) : (this.setNoTargetCache(k), t.length = 0, null)
            }
            createPeelFocus(a, b, c = 0) {
                let d, e;
                e = this.getCandidateExitDirection(b ? b.cell : null, b ? b.exitRow : 0, b ? b.exitCol : 0), d = this.getPeelFocusSideRange(b ? b.cell.col : 0);
                return {
                    id: ++this.peelFocusSeed,
                    colorRid: a,
                    keys: new Set,
                    anchorRow: b.cell.row,
                    anchorCol: b.cell.col,
                    exitRowDir: e.row,
                    exitColDir: e.col,
                    exitRow: b.exitRow,
                    exitCol: b.exitCol,
                    corridorKeys: this.buildPeelFocusCorridorKeys(b),
                    anchorPathCells: this.clonePathCells(b.pathCells),
                    anchorWorldPath: this.getAnchorWorldPathFromCandidate(b),
                    sideSign: d.sign,
                    sideMinCol: d.minCol,
                    sideMaxCol: d.maxCol,
                    sideHardLock: this.shouldHardLockPeelFocusSide(a, b ? b.cell : null, d, c)
                }
            }
            getPeelFocusSideRange(a) {
                let b, c, d;
                d = Math.max(0, this.columnCount - 1), b = .5 * d, c = Math.max(1, Math.floor(.08 * Math.max(this.columnCount, 1)));
                return a <= b - c ? {
                    sign: -1,
                    minCol: 0,
                    maxCol: Math.min(d, Math.ceil(b) + 0)
                } : a >= b + c ? {
                    sign: 1,
                    minCol: Math.max(0, Math.floor(b) - 0),
                    maxCol: d
                } : {
                    sign: 0,
                    minCol: 0,
                    maxCol: d
                }
            }
            shouldHardLockPeelFocusSide(a, b, c, d) {
                return !(!(b && c && c.sign) || d <= 0) && this.countConnectedSameColorCells(a, b, c, d) >= d
            }
            countConnectedSameColorCells(a, b, c, d) {
                let e, f, g, h, i;
                if (!b || b.colorRid !== a || !this.isCellInsideSideLock(c, b)) return 0;
                e = [b], f = {};
                f[b.key] = !0;
                g = l.PeelFocusNeighborOffsets;
                h = 0, i = 0;
                for (; h < e.length;) {
                    let b;
                    b = e[h++];
                    if (this.isCountableSameColorCell(a, b, c)) {
                        if (++i >= d) return i;
                        for (let d = 0; d < g.length; d++) {
                            let h, i, j;
                            h = g[d][0], j = g[d][1], i = this.getCell(b.row + h, b.col + j);
                            this.isCountableSameColorCell(a, i, c) && !f[i.key] && this.canStepBetweenSameColorCells(a, c, b, h, j) && (f[i.key] = !0, e.push(i))
                        }
                    }
                }
                return i
            }
            isCountableSameColorCell(a, b, c) {
                return !(!b || b.colorRid !== a || !this.isCellInsideSideLock(c, b)) && (1 === b.state || 2 === b.state)
            }
            canStepBetweenSameColorCells(a, b, c, d, e) {
                let f, g;
                if (!c || 0 === d || 0 === e) return !0;
                g = this.getCell(c.row + d, c.col), f = this.getCell(c.row, c.col + e);
                return this.isCountableSameColorCell(a, g, b) || this.isCountableSameColorCell(a, f, b)
            }
            getPeelFocusSideLock(a) {
                return a && a.sideHardLock && a.sideSign ? {
                    sign: a.sideSign,
                    minCol: a.sideMinCol,
                    maxCol: a.sideMaxCol
                } : null
            }
            isCellInsideSideLock(a, b) {
                return !(a && a.sign && b) || b.col >= a.minCol && b.col <= a.maxCol
            }
            isCellInsidePeelFocusSideRange(a, b) {
                return !(a && b && a.sideSign) || this.isCellInsideSideLock({
                    sign: a.sideSign,
                    minCol: a.sideMinCol,
                    maxCol: a.sideMaxCol
                }, b)
            }
            getFocusCandidateEstimateScore(a, b) {
                let c;
                c = this.getPeelFocusConnectionDistance(a, b);
                return this.isValidNumber(c) && c !== Number.MAX_VALUE ? 1e3 * c + Math.abs(b.row - a.anchorRow) + 1.01 * Math.abs(b.col - a.anchorCol) : Number.MAX_VALUE
            }
            getCandidateExitDirection(a, b, c) {
                let d, e;
                if (!a || !this.isValidNumber(b) || !this.isValidNumber(c)) return {
                    row: 0,
                    col: 0
                };
                e = b - a.row, d = c - a.col;
                return Math.abs(e) >= Math.abs(d) && 0 !== e ? {
                    row: e > 0 ? 1 : -1,
                    col: 0
                } : 0 !== d ? {
                    row: 0,
                    col: d > 0 ? 1 : -1
                } : {
                    row: 0,
                    col: 0
                }
            }
            doesCandidatePathMatchFocusExit(a, b) {
                let c;
                if (!a || !b || !a.exitRowDir && !a.exitColDir) return !0;
                c = this.getCandidateExitDirection(b.cell, b.exitRow, b.exitCol);
                return !c.row && !c.col || c.row === a.exitRowDir && c.col === a.exitColDir && (!(Math.abs(b.exitRow - a.exitRow) + Math.abs(b.exitCol - a.exitCol) > this.maxPeelFocusExitDistance) && this.doesCandidateTouchFocusCorridor(a, b))
            }
            buildPeelFocusCorridorKeys(a) {
                let b;
                b = new Set;
                if (!a || !a.pathCells || 0 === a.pathCells.length) return b;
                for (let c = Math.max(0, a.pathCells.length - this.peelFocusCorridorTailCount - 1); c < a.pathCells.length; c++) this.addCorridorCellWithNeighbors(b, a.pathCells[c]);
                return b
            }
            addCorridorCellWithNeighbors(a, b) {
                if (b)
                    for (let c = -1; c <= 1; c++)
                        for (let d = -1; d <= 1; d++) a.add(this.getKey(b.row + c, b.col + d))
            }
            doesCandidateTouchFocusCorridor(a, b) {
                if (!a.corridorKeys || a.corridorKeys.size <= 0 || !b.pathCells || 0 === b.pathCells.length) return !0;
                for (let c = Math.max(0, b.pathCells.length - this.peelFocusCorridorTailCount - 1); c < b.pathCells.length; c++) {
                    let d;
                    d = b.pathCells[c];
                    if (a.corridorKeys.has(this.getKey(d.row, d.col))) return !0
                }
                return !1
            }
            pushPeelDistanceOverrideChoice(a, b, c, d, e, f, g) {}
            isPeelFocusCandidate(a, b) {
                return !(!a || !b || b.colorRid !== a.colorRid) && (!!this.isCellInsidePeelFocusSideRange(a, b) && (!!a.keys.has(b.key) || this.getPeelFocusConnectionDistance(a, b) !== Number.MAX_VALUE))
            }
            hasPeelFocusFrontierCandidate(a, b) {
                let c, d;
                if (!a || a.colorRid !== b) return !1;
                c = this.getValidActualFrontier(b);
                for (let b = 0; b < c.length; b++)
                    if (this.isPeelFocusCandidate(a, c[b])) return !0;
                d = this.getValidFutureFrontier(b);
                for (let b = 0; b < d.length; b++)
                    if (this.isPeelFocusCandidate(a, d[b])) return !0;
                return !1
            }
            getPeelFocusConnectionDistance(a, b) {
                let c, d, e, f, g;
                if (!a || !b || b.colorRid !== a.colorRid || a.keys.size <= 0) return Number.MAX_VALUE;
                if (!this.isCellInsidePeelFocusSideRange(a, b)) return Number.MAX_VALUE;
                g = this.getCell(a.anchorRow, a.anchorCol);
                if (!g || g.colorRid !== a.colorRid) return Number.MAX_VALUE;
                if (b.key === g.key) return 0;
                if (!this.isPeelFocusSelectableFrontierCell(a, b)) return Number.MAX_VALUE;
                e = a.sideSign ? {
                    sign: a.sideSign,
                    minCol: a.sideMinCol,
                    maxCol: a.sideMaxCol
                } : null, c = [{
                    cell: b,
                    depth: 0,
                    order: 0
                }], d = {};
                d[b.key] = 0;
                f = 1;
                for (; c.length > 0;) {
                    let b, h, i, j;
                    b = 0;
                    for (let a = 1; a < c.length; a++)(c[a].depth < c[b].depth || c[a].depth === c[b].depth && c[a].order < c[b].order) && (b = a);
                    i = c.splice(b, 1)[0], j = i ? i.cell : null;
                    if (!j || i.depth !== d[j.key]) continue;
                    if (j.key === g.key) return i.depth;
                    h = this.getPeelFocusConnectionNeighbors(a, j, e);
                    for (let b = 0; b < h.length; b++) {
                        let g, j, k, l;
                        g = h[b], k = g ? g.cell : null;
                        if (!k || !this.isCellInsideSideLock(e, k) || !this.isPeelFocusConnectableCell(a, k)) continue;
                        j = i.depth + g.cost;
                        if (j > this.maxPeelFocusConnectionDepth) continue;
                        l = d[k.key];
                        this.isValidNumber(l) && l <= j || (d[k.key] = j, c.push({
                            cell: k,
                            depth: j,
                            order: f++
                        }))
                    }
                }
                return Number.MAX_VALUE
            }
            getPeelFocusConnectionNeighbors(a, b, c = null) {
                let d, e, f;
                e = [];
                if (!a || !b) return e;
                f = this.getStableSearchOffsets();
                for (let d = 0; d < f.length; d++) {
                    let g, h, i, j, k;
                    k = f[d][0], h = f[d][1], g = this.getCell(b.row + k, b.col + h);
                    g && this.isCellInsideSideLock(c, g) && this.isPeelFocusConnectableCell(a, g) && e.push({
                        cell: g,
                        cost: 1
                    });
                    i = g, j = this.getCell(b.row + 2 * k, b.col + 2 * h);
                    this.isPeelFocusBridgeEmptyCell(i) && this.isCellInsideSideLock(c, i) && j && this.isCellInsideSideLock(c, j) && this.isPeelFocusConnectableCell(a, j) && e.push({
                        cell: j,
                        cost: 2,
                        bridgeCell: i,
                        bridgeKey: "gap:" + i.key + ":" + j.key
                    })
                }
                d = l.DiagonalSearchOffsets;
                for (let f = 0; f < d.length; f++) {
                    let g, h, i, j, k, l;
                    g = d[f][0], i = d[f][1], k = this.getCell(b.row + g, b.col + i);
                    if (!k || !this.isCellInsideSideLock(c, k) || !this.isPeelFocusConnectableCell(a, k)) continue;
                    l = this.getCell(b.row + g, b.col), h = this.getCell(b.row, b.col + i), j = this.getPeelFocusDiagonalBridgeCell(a, l, h, c);
                    j && e.push({
                        cell: k,
                        cost: 2,
                        bridgeCell: j,
                        bridgeKey: "corner:" + j.key + ":" + k.key
                    })
                }
                return e
            }
            getPeelFocusDiagonalBridgeCell(a, b, c, d = null) {
                let e, f;
                f = this.isPeelFocusBridgeEmptyCell(b), e = this.isPeelFocusBridgeEmptyCell(c);
                return f && this.isCellInsideSideLock(d, b) && !this.isPeelFocusSolidDifferentColorBlocker(a, c) ? b : e && this.isCellInsideSideLock(d, c) && !this.isPeelFocusSolidDifferentColorBlocker(a, b) ? c : null
            }
            isPeelFocusBridgeEmptyCell(a) {
                return !!a && 0 === a.state
            }
            isPeelFocusSolidDifferentColorBlocker(a, b) {
                return !(!a || !b) && (b.colorRid !== a.colorRid && (1 === b.state || 2 === b.state))
            }
            getPeelFocusLocalSupportScore(a, b) {
                let c, d;
                if (!a || !b) return 0;
                d = 0;
                c = l.PeelFocusNeighborOffsets;
                for (let e = 0; e < c.length; e++) {
                    let f;
                    f = this.getCell(b.row + c[e][0], b.col + c[e][1]);
                    f && this.isPeelFocusConnectableCell(a, f) && d++
                }
                return d
            }
            canStepToPeelFocusNeighbor(a, b, c, d) {
                let e, f;
                if (!b || 0 === c || 0 === d) return !0;
                f = this.getCell(b.row + c, b.col), e = this.getCell(b.row, b.col + d);
                return this.isPeelFocusConnectableCell(a, f) || this.isPeelFocusConnectableCell(a, e)
            }
            isPeelFocusConnectableCell(a, b) {
                return !(!a || !b || b.colorRid !== a.colorRid) && (!!this.isCellInsidePeelFocusSideRange(a, b) && (a.keys.has(b.key) ? 1 === b.state || 2 === b.state : 1 === b.state))
            }
            isPeelFocusSelectableFrontierCell(a, b) {
                return !(!a || !b || b.colorRid !== a.colorRid) && (!(!this.isCellInsidePeelFocusSideRange(a, b) || !this.isAliveCell(b)) && (this.isCellInActualFrontier(b) || this.isCellInFutureFrontier(b)))
            }
            considerOriginalCandidate(a, b, c, d) {
                let e, f, g, h;
                if (!b || !d) return;
                f = this.getCandidateEstimateSteps(d, b);
                if (!this.isValidNumber(f) || f === Number.MAX_VALUE) return;
                h = {
                    cell: b,
                    isFuture: c,
                    estimateScore: f
                }, g = a[0], e = a[1];
                if (!g || h.estimateScore < g.estimateScore) return a[1] = g, void(a[0] = h);
                (!e || h.estimateScore < e.estimateScore) && (a[1] = h)
            }
            buildAnchoredPathCandidate(a, b) {
                let c, d, e, f, g;
                if (!a || !b || !b.anchorPathCells || b.anchorPathCells.length <= 1 || !a.pathCells || a.pathCells.length <= 0) return a;
                c = this.findAnchorPathJoinIndex(a, b.anchorPathCells);
                if (c < 0) return a;
                g = this.trimCandidatePrefixToAnchorPath(a.pathCells, b.anchorPathCells[c]);
                if (!g || g.length <= 0) return a;
                e = [];
                for (let a = 0; a < g.length; a++) this.pushPathCellIfChanged(e, g[a]);
                for (let a = c; a < b.anchorPathCells.length; a++) this.pushPathCellIfChanged(e, b.anchorPathCells[a]);
                if (e.length <= 0) return a;
                f = this.pathCellsToWaypoints(e, this.pathWorldY, a.cell);
                if (!f || f.length <= 0) return a;
                d = this.getCandidateExitCell(a.cell, e);
                return {
                    cell: a.cell,
                    path: f,
                    isFuture: a.isFuture,
                    exitRow: d.row,
                    exitCol: d.col,
                    pathCells: e
                }
            }
            findAnchorPathJoinIndex(a, b) {
                let c, d;
                if (!a || !a.pathCells || !b || b.length <= 0) return -1;
                d = -1, c = Number.MAX_VALUE;
                for (let e = Math.max(0, b.length - this.peelFocusCorridorTailCount - 1); e < b.length; e++) {
                    let f;
                    f = b[e];
                    for (let b = 0; b < a.pathCells.length; b++) {
                        let g;
                        g = Math.abs(a.pathCells[b].row - f.row) + Math.abs(a.pathCells[b].col - f.col);
                        g < c && (c = g, d = e)
                    }
                }
                return c <= this.maxPeelFocusExitDistance + 1 ? d : -1
            }
            trimCandidatePrefixToAnchorPath(a, b) {
                let c, d, e;
                if (!a || a.length <= 0 || !b) return null;
                c = 0, d = Number.MAX_VALUE;
                for (let e = 0; e < a.length; e++) {
                    let f;
                    f = Math.abs(a[e].row - b.row) + Math.abs(a[e].col - b.col);
                    f < d && (d = f, c = e)
                }
                e = [];
                for (let b = 0; b <= c; b++) this.pushPathCellIfChanged(e, a[b]);
                return d > 0 && this.pushPathCellIfChanged(e, b), e
            }
            pushPathCellIfChanged(a, b) {
                let c;
                if (!a || !b) return;
                c = a.length > 0 ? a[a.length - 1] : null;
                c && c.row === b.row && c.col === b.col || a.push({
                    row: b.row,
                    col: b.col
                })
            }
            clonePathCells(a) {
                let b;
                b = [];
                if (!a) return b;
                for (let c = 0; c < a.length; c++) this.pushPathCellIfChanged(b, a[c]);
                return b
            }
            emitCandidateSearchDiagnostic(a, b, c, d) {
                let e, f;
                if (!this.diagnostics || "function" != typeof this.diagnostics.onCandidateSearch) return;
                f = [];
                for (let a = 0; c && a < c.length; a++) {
                    let b;
                    b = c[a];
                    b && b.cell && f.push({
                        row: b.cell.row,
                        col: b.cell.col,
                        isFuture: !!b.isFuture,
                        estimateScore: Number(b.estimateScore || 0)
                    })
                }
                e = null;
                if (d && d.cell) {
                    let a, b;
                    a = [];
                    for (let b = 0; d.pathCells && b < d.pathCells.length; b++) a.push({
                        row: d.pathCells[b].row,
                        col: d.pathCells[b].col
                    });
                    b = [];
                    for (let a = 0; d.path && a < d.path.length; a++) {
                        let c;
                        c = d.path[a];
                        b.push([Number(c.x), Number(c.y), Number(c.z)])
                    }
                    e = {
                        row: d.cell.row,
                        col: d.cell.col,
                        isFuture: !!d.isFuture,
                        exitRow: d.exitRow,
                        exitCol: d.exitCol,
                        pathCells: a,
                        path: b
                    }
                }
                this.diagnostics.onCandidateSearch({
                    phase: a,
                    colorRid: b,
                    candidates: f,
                    selected: e
                })
            }
            emitReservationDiagnostic(a, b, c, d) {
                let e, f, g;
                if (!this.diagnostics || !c || "function" != typeof this.diagnostics.onReservationEvent) return;
                "create" === a && (c.diagnosticKind = b, c.diagnosticPathCells = this.clonePathCells(d || []));
                g = c.diagnosticPathCells || [], e = [];
                for (let a = 0; a < g.length; a++) e.push({
                    row: g[a].row,
                    col: g[a].col
                });
                f = [];
                for (let a = 0; c.path && a < c.path.length; a++) {
                    let b;
                    b = c.path[a];
                    f.push([Number(b.x), Number(b.y), Number(b.z)])
                }
                this.diagnostics.onReservationEvent({
                    action: a,
                    kind: c.diagnosticKind || b,
                    id: c.id,
                    row: c.row,
                    col: c.col,
                    colorRid: c.colorRid,
                    predictedReadyTime: Number(c.predictedReadyTime || 0),
                    pathCells: e,
                    path: f
                })
            }
            tryBuildOriginalPathCandidate(a, b) {
                let c, d, e;
                if (!b || !b.cell) return null;
                c = this.findPathCellsToCell(a, b.cell, b.isFuture);
                if (!c || 0 === c.length) return null;
                d = this.pathCellsToWaypoints(c, this.pathWorldY, b.cell), e = this.getCandidateExitCell(b.cell, c);
                return {
                    cell: b.cell,
                    path: d,
                    isFuture: b.isFuture,
                    exitRow: e.row,
                    exitCol: e.col,
                    pathCells: c
                }
            }
            getEffectivePathSearchCount(a, b) {
                return !this.isValidNumber(b) || b <= 0 ? a ? this.maxPathSearchCandidateCount : this.maxReadOnlyPathSearchCandidateCount : Math.max(1, Math.min(Math.max(this.maxPathSearchCandidateCount, this.maxPeelFocusPathSearchCandidateCount), Math.floor(b)))
            }
            findBestPathCandidate(a, b, c, d, e, f = !1, g = null) {
                let h;
                h = this.findBestPathCandidateInternal(a, b, c, d, e, f, g, !0);
                return !h && g && (h = this.findBestPathCandidateInternal(a, b, c, d, e, f, g, !1)), h
            }
            findBestPathCandidateInternal(a, b, c, d, e, f, g, h) {
                let i, j, k, l, m;
                k = null, m = null, j = Number.MAX_VALUE, i = 0;
                l = g ? null : this.getCannonFirePosition(a);
                for (let n = 0; n < b.length && i < d; n++) {
                    let o, p, q, r, s;
                    r = b[n];
                    if (!r || !r.cell) continue;
                    i++;
                    s = this.tryBuildOriginalPathCandidate(a, r);
                    if (!s) continue;
                    o = g ? this.buildAnchoredPathCandidate(s, g) : s;
                    if (h && g && !this.doesCandidatePathMatchFocusExit(g, o)) continue;
                    p = this.getPathDistanceScore(a, o.path);
                    if (r.isFuture && !f && !this.isFutureTargetReadyOnArrival(r.cell, p, c)) continue;
                    q = g ? r.estimateScore : this.getInitialCandidateSelectionScore(l, r.cell, p);
                    if ((!m || q < j) && (k = r, m = o, j = q), e && this.shouldAcceptActualCandidateEarly(k, j, i, d)) break
                }
                return m
            }
            shouldAcceptActualCandidateEarly(a, b, c, d) {
                let e;
                if (!a || a.isFuture) return !1;
                e = 2.5 * Math.max(Math.abs(this.rowStep), Math.abs(this.colStep), 1);
                return b <= a.estimateScore + e || c >= Math.min(4, d)
            }
            getNoTargetCacheKey(a, b, c, d, e, f = 0) {
                let g, h;
                g = this.clampPathCell({
                    row: this.getNearestPathIndex(this.rowWorldZ, b.z),
                    col: this.getNearestPathIndex(this.colWorldX, b.x)
                }), h = Math.round(1e3 * (d || this.defaultAntSpeed));
                return a + ";" + this.getCurrentPathCellId(g.row, g.col) + ";" + (c ? 1 : 0) + "," + e + "," + h + "," + f + ";" + this.actualPathSearchVersion + "," + this.futurePathSearchVersion
            }
            isNoTargetCached(a) {
                let b;
                b = this.noTargetUntilByKey[a];
                return this.isValidNumber(b) && b > this.getNowMs()
            }
            setNoTargetCache(a) {
                this.noTargetUntilByKey[a] = this.getNowMs() + this.noTargetCooldownMs
            }
            clearNoTargetCache() {
                this.noTargetUntilByKey = {}
            }
            pushLimitedCandidateChoice(a, b, c, d, e, f) {
                let g, h;
                g = f ? this.getFocusCandidateEstimateScore(f, b) : this.getCandidateEstimateScore(d, b);
                if (!this.isValidNumber(g) || g === Number.MAX_VALUE) return;
                h = a.length;
                for (; h > 0 && a[h - 1].estimateScore > g;) h--;
                h >= e || (a.splice(h, 0, {
                    cell: b,
                    isFuture: c,
                    estimateScore: g
                }), a.length > e && (a.length = e))
            }
            getInitialCandidateSelectionScore(a, b, c) {
                let d, e;
                if (!a || !b || !b.cube || !b.cube.sp3 || b.cube.sp3.destroyed) return c;
                d = this.getWorldSideSign(a.x), e = this.getWorldSideSign(b.cube.sp3.transform.position.x);
                return 0 !== d && 0 !== e && d !== e ? c + Math.max(Math.abs(this.colStep), 1) * Math.max(this.columnCount, 1) * 8 : c
            }
            getWorldSideSign(a) {
                let b, c;
                if (!this.isValidNumber(a) || !this.colWorldX || this.colWorldX.length <= 0) return 0;
                c = .5 * (this.colWorldX[0] + this.colWorldX[this.colWorldX.length - 1]), b = Math.max(Math.abs(this.colStep), 1) * Math.max(1, Math.floor(.08 * Math.max(this.columnCount, 1)));
                return a <= c - b ? -1 : a >= c + b ? 1 : 0
            }
            getCandidateEstimateScore(a, b) {
                let c, d;
                if (!a || !b || !b.cube || !b.cube.sp3 || b.cube.sp3.destroyed) return Number.MAX_VALUE;
                c = b.cube.sp3.transform.position, d = Math.abs(a.x - c.x) + Math.abs(a.z - c.z);
                return this.getInitialCandidateSelectionScore(a, b, d)
            }
            isFutureTargetReadyOnArrival(a, b, c) {
                let d, e;
                if (!a) return !1;
                e = this.futureReadyTimeByKey[a.key];
                if (!this.isValidNumber(e)) return !1;
                d = Math.max(c || this.defaultAntSpeed, 1e-4);
                return e < this.getNowMs() + b / d * 1e3
            }
            getCandidateEstimateSteps(a, b) {
                return a && b ? Math.abs(b.col - a.col) + b.row + 1 : Number.MAX_VALUE
            }
            commitReservation(a) {
                let b, c;
                b = this.reservations[a];
                if (!b) return null;
                delete this.reservations[a], this.reservationRevision++;
                c = this.getCell(b.row, b.col);
                return this.reservedCellIds.delete(this.getStaticCellId(b.row, b.col)), c && c.reservationId === a && (c.state = 3, c.reservationId = 0, c.cube = null, this.writeSourceCell(b.row, b.col, 0, 0), this.refreshFrontierAfterRemovedCell(b.row, b.col), this.markFutureFrontierDirty()), this.emitReservationDiagnostic("commit", b.diagnosticKind || "normal", b), b
            }
            tryReserveReviveDirectTarget(a, b, c, d, e) {
                let f, g, h;
                if (!a || a.bulletTotalNum <= 0) return null;
                h = this.findReviveFillCell(a, b, c, d, e);
                if (!h) return null;
                f = ++this.reservationSeed;
                h.state = 2, h.reservationId = f, this.reservedCellIds.add(this.getStaticCellId(h.row, h.col)), this.removeFrontier(h), this.removeFromFutureFrontier(h);
                g = {
                    id: f,
                    row: h.row,
                    col: h.col,
                    colorRid: h.colorRid,
                    cube: h.cube,
                    cannon: a,
                    path: [],
                    predictedReadyTime: this.getNowMs()
                };
                return this.reservations[f] = g, this.reservationRevision++, this.emitReservationDiagnostic("create", "reviveDirect", g), g
            }
            appendReservedCellIds(a) {
                a && this.reservedCellIds.forEach(b => a.add(b))
            }
            getStaticCellId(a, b) {
                return 65536 * (a + 32768) + (b + 32768)
            }
            commitReservations(a, b) {
                let c, d, e, f;
                c = b || [];
                if (c.length = 0, !a || a.length <= 0) return c;
                e = !1, f = !1;
                d = [];
                for (let b = 0; b < a.length; b++) {
                    let g, h, i;
                    h = a[b], i = this.reservations[h];
                    if (!i) continue;
                    delete this.reservations[h], f = !0;
                    g = this.getCell(i.row, i.col);
                    this.reservedCellIds.delete(this.getStaticCellId(i.row, i.col)), g && g.reservationId === h && (g.state = 3, g.reservationId = 0, g.cube = null, this.writeSourceCell(i.row, i.col, 0, 0), e = !0, d.push({
                        row: i.row,
                        col: i.col
                    })), c.push(i), this.emitReservationDiagnostic("commit", i.diagnosticKind || "normal", i)
                }
                if (e) {
                    if (this.exteriorAirDirty) this.rebuildExteriorAirIfNeeded(), this.rebuildFrontier();
                    else {
                        let a;
                        a = {};
                        for (let b = 0; b < d.length; b++) {
                            let c, e;
                            c = d[b], e = this.getCell(c.row, c.col);
                            e && (this.removeFrontier(e), this.removeFromFutureFrontier(e)), this.expandExteriorAirFromRemovedCell(c.row, c.col, a), this.collectAdjacentAliveCells(c.row, c.col, a)
                        }
                        this.refreshAffectedFrontier(a)
                    }
                    this.markFutureFrontierDirty()
                }
                return f && this.reservationRevision++, c
            }
            refreshFrontierAfterRemovedCell(a, b) {
                let c, d;
                c = this.getCell(a, b);
                if (c && (this.removeFrontier(c), this.removeFromFutureFrontier(c)), this.exteriorAirDirty) return this.rebuildExteriorAirIfNeeded(), void this.rebuildFrontier();
                d = {};
                this.expandExteriorAirFromRemovedCell(a, b, d), this.collectAdjacentAliveCells(a, b, d), this.refreshAffectedFrontier(d)
            }
            expandExteriorAirFromRemovedCell(a, b, c) {
                let d, e, f, g, h;
                if (!this.isPathCellInSearchBounds(a, b) || !this.isAirCellPassable(a, b)) return;
                h = this.getKey(a, b);
                if (this.exteriorAirKeys[h]) return;
                g = this.getStableSearchOffsets();
                f = !1;
                for (let c = 0; c < g.length; c++) {
                    let d;
                    d = this.getKey(a + g[c][0], b + g[c][1]);
                    if (this.exteriorAirKeys[d]) {
                        f = !0;
                        break
                    }
                }
                if (!f) return;
                d = [{
                    row: a,
                    col: b
                }];
                e = 0;
                for (; e < d.length;) {
                    let a, b;
                    a = d[e++];
                    if (!this.isPathCellInSearchBounds(a.row, a.col) || !this.isAirCellPassable(a.row, a.col)) continue;
                    b = this.getKey(a.row, a.col);
                    if (!this.exteriorAirKeys[b]) {
                        this.exteriorAirKeys[b] = !0, this.collectAdjacentAliveCells(a.row, a.col, c);
                        for (let b = 0; b < g.length; b++) {
                            let c, e, f;
                            e = a.row + g[b][0], f = a.col + g[b][1], c = this.getKey(e, f);
                            !this.exteriorAirKeys[c] && this.isPathCellInSearchBounds(e, f) && this.isAirCellPassable(e, f) && d.push({
                                row: e,
                                col: f
                            })
                        }
                    }
                }
            }
            collectAdjacentAliveCells(a, b, c) {
                let d;
                d = l.ClearNeighborOffsets;
                for (let e = 0; e < d.length; e++) {
                    let f;
                    f = this.getCell(a + d[e][0], b + d[e][1]);
                    f && 0 !== f.state && 3 !== f.state && (c[f.key] = f)
                }
            }
            refreshAffectedFrontier(a) {
                let b;
                b = Object.keys(a);
                for (let c = 0; c < b.length; c++) {
                    let d;
                    d = a[b[c]];
                    this.refreshCellFrontier(d.row, d.col)
                }
            }
            releaseReservation(a) {
                let b, c;
                b = this.reservations[a];
                if (!b) return null;
                delete this.reservations[a], this.reservationRevision++;
                c = this.getCell(b.row, b.col);
                return this.reservedCellIds.delete(this.getStaticCellId(b.row, b.col)), c && c.reservationId === a && (c.state = 1, c.reservationId = 0, this.refreshCellFrontier(b.row, b.col), this.markFutureFrontierDirty()), this.emitReservationDiagnostic("release", b.diagnosticKind || "normal", b), b
            }
            hasReservation(a) {
                return !!this.reservations[a]
            }
            getReservationRevision() {
                return this.reservationRevision
            }
            isReservedCell(a, b) {
                let c;
                c = this.getCell(a, b);
                return !!c && 2 === c.state
            }
            setBlackHolePosition(a) {
                let b;
                if (!a || 0 === this.grid.length || this.columnCount <= 0) return void(this.blackHolePathCell && (this.blackHolePathCell = null, this.markExteriorAirDirty(), this.rebuildFrontier(), this.markFutureFrontierDirty()));
                b = {
                    row: this.getNearestPathIndex(this.rowWorldZ, a.z),
                    col: this.getNearestPathIndex(this.colWorldX, a.x)
                };
                this.blackHolePathCell && this.blackHolePathCell.row === b.row && this.blackHolePathCell.col === b.col || (this.blackHolePathCell = b, this.markExteriorAirDirty(), this.rebuildFrontier(), this.markFutureFrontierDirty())
            }
            findWorldPath(a, b, c) {
                return this.findWorldPathByStartAxes(a, b, c, this.rowWorldZ, this.colWorldX, -1)
            }
            findWorldPathWithStartAxes(a, b, c, d, e, f = -1) {
                return d && 0 !== d.length && e && 0 !== e.length ? this.findWorldPathByStartAxes(a, b, c, d, e, f) : this.findWorldPath(a, b, c)
            }
            findWorldPathByStartAxes(a, b, c, d, e, f) {
                let g, h, i;
                if (!a || !b) return null;
                if (0 === this.grid.length || this.columnCount <= 0) return [new Laya.Vector3(b.x, c, b.z)];
                i = this.getNearestReturnPathStartCell(this.clampPathCell({
                    row: this.getNearestPathIndex(d, a.z),
                    col: this.getNearestPathIndex(e, a.x)
                })), g = this.getReturnPathDestinations(f);
                if (0 === g.length) return this.boardWallEnabled ? null : [new Laya.Vector3(b.x, c, b.z)];
                h = this.searchPathCells(i, g, this.getStableSearchOffsets(), !0, !0);
                return h && 0 !== h.length ? this.pathCellsToWorldWaypoints(h, c, b) : this.boardWallEnabled ? null : [new Laya.Vector3(b.x, c, b.z)]
            }
            getNearestReturnPathStartCell(a) {
                let b, c, d, e, f;
                if (this.isReturnPathStartCellUsable(a)) return a;
                d = [a], c = {};
                c[this.getKey(a.row, a.col)] = !0;
                b = this.getStableSearchOffsets(), f = Math.max(1, (this.getMaxPathRow() - this.getMinPathRow() + 1) * (this.getMaxPathCol() - this.getMinPathCol() + 1));
                e = 0;
                for (; e < d.length && e < f;) {
                    let a;
                    a = d[e++];
                    for (let e = 0; e < b.length; e++) {
                        let f, g, h, i;
                        i = a.row + b[e][0], g = a.col + b[e][1];
                        if (!this.isPathCellInSearchBounds(i, g)) continue;
                        h = this.getKey(i, g);
                        if (c[h]) continue;
                        c[h] = !0;
                        f = {
                            row: i,
                            col: g
                        };
                        if (this.isReturnPathStartCellUsable(f)) return f;
                        d.push(f)
                    }
                }
                return a
            }
            isReturnPathStartCellUsable(a) {
                return this.isPathCellInSearchBounds(a.row, a.col) && this.isPathCellPassable(a.row, a.col, !0) && this.isExteriorAirCell(a.row, a.col)
            }
            getNearestForwardPathStartCell(a, b) {
                let c, d, e, f, g;
                if (this.isForwardPathStartCellUsable(a, b)) return a;
                f = [a], e = {};
                e[this.getKey(a.row, a.col)] = !0;
                d = this.getStableSearchOffsets(), c = Math.max(1, (this.getMaxPathRow() - this.getMinPathRow() + 1) * (this.getMaxPathCol() - this.getMinPathCol() + 1));
                g = 0;
                for (; g < f.length && g < c;) {
                    let a;
                    a = f[g++];
                    for (let c = 0; c < d.length; c++) {
                        let g, h, i, j;
                        j = a.row + d[c][0], h = a.col + d[c][1];
                        if (!this.isPathCellInSearchBounds(j, h)) continue;
                        g = this.getKey(j, h);
                        if (e[g]) continue;
                        e[g] = !0;
                        i = {
                            row: j,
                            col: h
                        };
                        if (this.isForwardPathStartCellUsable(i, b)) return i;
                        f.push(i)
                    }
                }
                return null
            }
            isForwardPathStartCellUsable(a, b) {
                let c;
                if (!this.isPathCellInSearchBounds(a.row, a.col) || !this.isPathCellPassable(a.row, a.col, !1) || !this.isExteriorAirCell(a.row, a.col)) return !1;
                if (!b) return !0;
                c = this.getCellCenterWaypoint(a, this.pathWorldY);
                return !this.isSegmentCrossBlackHoleBlockedArea(b.x, b.z, c.x, c.z)
            }
            findPathToCell(a, b, c) {
                let d;
                d = this.findPathCellsToCell(a, b, c);
                return d && 0 !== d.length ? this.pathCellsToWaypoints(d, this.pathWorldY, b) : null
            }
            findPathCellsToCell(a, b, c) {
                let d, e, f;
                if (!this.isAliveCell(b) || 0 === this.grid.length || this.columnCount <= 0) return null;
                f = this.getCannonFirePosition(a);
                if (!f) return null;
                d = this.getNearestForwardPathStartCell(this.getBottomEntryCellFromWorld(f), f);
                if (!d) return null;
                e = this.getPathDestinations(b, c);
                return 0 === e.length ? null : this.findBestPathCellsToTarget(d, e, f, b, c)
            }
            getCandidateExitCell(a, b) {
                let c;
                if (!b || b.length <= 1) return {
                    row: a.row,
                    col: a.col
                };
                c = b[b.length - 2];
                return {
                    row: c.row,
                    col: c.col
                }
            }
            findBestPathCellsToTarget(a, b, c, d, e) {
                return this.searchPathCells(a, b, void 0, !1, !0, e)
            }
            getWorldPathScore(a, b) {
                let c, d, e, f, g, h;
                if (!a || !b || 0 === b.length) return Number.MAX_VALUE;
                g = 0, f = 0, h = a.x, c = a.z, d = 0, e = 0;
                for (let a = 0; a < b.length; a++) {
                    let i, j, k;
                    j = b[a].x - h, i = b[a].z - c, k = Math.sqrt(j * j + i * i);
                    if (k > .001) {
                        let a, b;
                        a = Math.abs(j) > Math.abs(i) ? j > 0 ? 1 : -1 : 0, b = Math.abs(i) >= Math.abs(j) ? i > 0 ? 1 : -1 : 0;
                        0 === d && 0 === e || d === a && e === b || f++, d = a, e = b, g += k
                    }
                    h = b[a].x, c = b[a].z
                }
                return g + .01 * f
            }
            getPathDestinations(a, b) {
                return a && this.isPathCellInSearchBounds(a.row, a.col) ? this.isBlackHolePathCell(a.row, a.col) ? [] : [{
                    row: a.row,
                    col: a.col
                }] : []
            }
            getReturnPathDestinations(a) {
                let b, c, d;
                d = [], b = this.getMinPathCol(), c = this.getMaxPathCol();
                for (let e = b; e <= c; e++) this.isPathCellInSearchBounds(a, e) && this.isPathCellPassable(a, e, !0) && d.push({
                    row: a,
                    col: e
                });
                return d
            }
            getWorldRowDirection(a, b) {
                return (b.z >= a.z ? 1 : -1) === (this.rowStep >= 0 ? 1 : -1) ? 1 : -1
            }
            getReturnSearchOffsets(a) {
                return a < 0 ? l.ReturnSearchOffsetsUp : l.ReturnSearchOffsetsDown
            }
            getStableSearchOffsets() {
                return l.StableSearchOffsets
            }
            searchPathCells(a, b, c, d, e, f) {
                let g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z, A, B;
                if (!a || !b || 0 === b.length) return null;
                q = this.getMinPathRow(), y = this.getMinPathCol(), B = this.getMaxPathCol() - y + 1;
                if (B <= 0) return null;
                z = c || this.getStableSearchOffsets(), o = this.getPathSearchCache(f), i = this.getPathSearchCacheKey(a, b, z, d, e, f, q, y, B);
                if (o.hasOwnProperty(i)) return o[i];
                if (!d && this.isBlackHolePathCell(a.row, a.col)) return this.setPathSearchCache(i, null, f), null;
                k = this.getPathCellId(a.row, a.col, q, y, B);
                t = ++this.pathSearchRunId;
                t >= 1073741823 && (this.pathSearchRunId = 1, t = this.pathSearchRunId);
                m = [k], A = this.pathHeapIndex, u = this.pathOpenMark, h = this.pathClosedMark, x = this.pathScoreMark, v = this.pathDestinationMark, n = this.pathOpenOrder, r = this.pathGScore, l = this.pathFScore, w = this.pathPrevious;
                p = 0;
                for (let a = 0; a < b.length; a++) {
                    v[this.getPathCellId(b[a].row, b[a].col, q, y, B)] = t
                }
                A[k] = 0, u[k] = t, n[k] = ++p, x[k] = t, r[k] = 0, l[k] = this.getHeuristicCostByRowCol(a.row, a.col, b);
                j = 0;
                for (; m.length > 0;) {
                    let a, c, g;
                    g = this.popPathOpenHeap(m, A, l, n);
                    if (h[g] === t) continue;
                    u[g] = 0;
                    a = this.getPathCellRowFromId(g, q, B), c = this.getPathCellColFromId(g, y, B);
                    if (v[g] === t) {
                        j = g;
                        break
                    }
                    h[g] = t;
                    for (let i = 0; i < z.length; i++) {
                        let j, o, s, C, D, E;
                        o = a + z[i][0], D = c + z[i][1];
                        if (!this.isPathCellInSearchBounds(o, D)) continue;
                        s = this.getPathCellId(o, D, q, y, B);
                        if (h[s] === t) continue;
                        C = s === k, E = v[s] === t;
                        if (!C && !E && !this.isPathCellPassable(o, D, d, f)) continue;
                        if (!C && !E && e && !this.isExteriorAirCell(o, D, f)) continue;
                        j = r[g] + 1;
                        x[s] === t && j >= r[s] || (w[s] = g, x[s] = t, r[s] = j, l[s] = j + this.getHeuristicCostByRowCol(o, D, b), u[s] !== t ? (u[s] = t, n[s] = ++p, this.pushPathOpenHeap(m, A, s, l, n)) : this.resortPathOpenHeap(m, A, s, l, n))
                    }
                }
                if (!j) return this.setPathSearchCache(i, null, f), null;
                g = [];
                s = j;
                for (; s && (g.push(this.pathCellIdToCell(s, q, y, B)), s !== k);) s = w[s];
                return g.reverse(), this.setPathSearchCache(i, g, f), g
            }
            getPathSearchCacheKey(a, b, c, d, e, f, g, h, i) {
                let j, k;
                k = "";
                for (let a = 0; a < b.length; a++) a > 0 && (k += "|"), k += b[a].row + "," + b[a].col;
                j = "";
                for (let a = 0; a < c.length; a++) a > 0 && (j += "|"), j += c[a][0] + "," + c[a][1];
                return this.actualPathSearchVersion + "," + (f ? this.futurePathSearchVersion : 0) + ";" + a.row + "," + a.col + ";" + k + ";" + j + ";" + (d ? 1 : 0) + "," + (e ? 1 : 0) + "," + (f ? 1 : 0) + ";" + g + "," + h + "," + i
            }
            getPathSearchCache(a) {
                return a ? this.futurePathSearchCache : this.actualPathSearchCache
            }
            setPathSearchCache(a, b, c) {
                let d, e, f;
                f = this.getPathSearchCache(c), d = c ? this.futurePathSearchCacheKeys : this.actualPathSearchCacheKeys;
                if (f.hasOwnProperty(a)) return void(f[a] = b);
                if (f[a] = b, d.push(a), d.length <= this.maxPathSearchCacheCount) return;
                e = d.shift();
                null != e && delete f[e]
            }
            getHeuristicCostByRowCol(a, b, c) {
                let d;
                d = Number.MAX_VALUE;
                for (let e = 0; e < c.length; e++) {
                    let f;
                    f = Math.abs(a - c[e].row) + Math.abs(b - c[e].col);
                    f < d && (d = f)
                }
                return d === Number.MAX_VALUE ? 0 : d
            }
            getPathCellId(a, b, c, d, e) {
                return (a - c) * e + (b - d) + 1
            }
            getCurrentPathCellId(a, b) {
                let c, d, e;
                d = this.getMinPathRow(), c = this.getMinPathCol(), e = this.getMaxPathCol() - c + 1;
                return e <= 0 || !this.isPathCellInSearchBounds(a, b) ? 0 : this.getPathCellId(a, b, d, c, e)
            }
            pathCellIdToCell(a, b, c, d) {
                let e;
                e = a - 1;
                return {
                    row: Math.floor(e / d) + b,
                    col: e % d + c
                }
            }
            getPathCellRowFromId(a, b, c) {
                return Math.floor((a - 1) / c) + b
            }
            getPathCellColFromId(a, b, c) {
                return (a - 1) % c + b
            }
            pushPathOpenHeap(a, b, c, d, e) {
                a.push(c), b[c] = a.length - 1, this.siftPathOpenHeapUp(a, b, a.length - 1, d, e)
            }
            popPathOpenHeap(a, b, c, d) {
                let e, f;
                e = a[0], f = a.pop();
                return delete b[e], a.length > 0 && void 0 !== f && (a[0] = f, b[f] = 0, this.siftPathOpenHeapDown(a, b, 0, c, d)), e
            }
            resortPathOpenHeap(a, b, c, d, e) {
                let f;
                f = b[c];
                null == f || f < 0 || this.siftPathOpenHeapUp(a, b, f, d, e)
            }
            siftPathOpenHeapUp(a, b, c, d, e) {
                for (; c > 0;) {
                    let f;
                    f = c - 1 >> 1;
                    if (this.comparePathOpenHeapCell(a[f], a[c], d, e) <= 0) break;
                    this.swapPathOpenHeapCell(a, b, f, c), c = f
                }
            }
            siftPathOpenHeapDown(a, b, c, d, e) {
                let f;
                f = a.length;
                for (;;) {
                    let g, h, i;
                    i = 2 * c + 1, h = i + 1;
                    g = c;
                    if (i < f && this.comparePathOpenHeapCell(a[i], a[g], d, e) < 0 && (g = i), h < f && this.comparePathOpenHeapCell(a[h], a[g], d, e) < 0 && (g = h), g === c) break;
                    this.swapPathOpenHeapCell(a, b, g, c), c = g
                }
            }
            swapPathOpenHeapCell(a, b, c, d) {
                let e;
                e = a[c];
                a[c] = a[d], a[d] = e, b[a[c]] = c, b[a[d]] = d
            }
            comparePathOpenHeapCell(a, b, c, d) {
                let e;
                e = this.getPathOpenHeapScore(a, c) - this.getPathOpenHeapScore(b, c);
                return Math.abs(e) > 1e-4 ? e : (d[a] || 0) - (d[b] || 0)
            }
            getPathOpenHeapScore(a, b) {
                let c;
                c = b[a];
                return this.isValidNumber(c) ? c : Number.MAX_VALUE
            }
            pathCellsToWaypoints(a, b, c) {
                let d;
                d = [];
                for (let c = 0; c < a.length; c++) {
                    let e;
                    e = a[c];
                    this.pushWaypointIfChanged(d, this.getCellCenterWaypoint(e, b))
                }
                return d
            }
            getCubeApproachWaypoint(a, b, c) {
                let d, e, f, g, h, i, j, k;
                e = c.cube.sp3.transform.position;
                if (!a || 0 === a.length) return new Laya.Vector3(e.x, b, e.z);
                d = a[a.length - 1], g = this.getWorldXForPathCol(d.col), j = this.getWorldZForPathRow(d.row), f = g - e.x, k = j - e.z, i = Math.sqrt(f * f + k * k);
                if (i <= 1e-4) return new Laya.Vector3(e.x, b, e.z);
                h = Math.max(Math.min(Math.abs(this.colStep), Math.abs(this.rowStep)), 1e-4) * this.cubeApproachDistanceScale;
                return new Laya.Vector3(e.x + f / i * h, b, e.z + k / i * h)
            }
            pathCellsToWorldWaypoints(a, b, c) {
                let d;
                d = [];
                for (let c = 0; c < a.length; c++) {
                    let e;
                    e = a[c];
                    this.pushWaypointIfChanged(d, this.getCellCenterWaypoint(e, b))
                }
                return this.pushWaypointIfChanged(d, new Laya.Vector3(c.x, b, c.z)), d
            }
            getCellCenterWaypoint(a, b) {
                return new Laya.Vector3(this.getWorldXForPathCol(a.col), b, this.getWorldZForPathRow(a.row))
            }
            getClearanceWaypoint(a, b) {
                let c, d, e, f, g, h, i;
                g = this.getWorldXForPathCol(a.col), d = this.getWorldZForPathRow(a.row);
                c = 0, f = 0;
                h = this.getStableSearchOffsets();
                for (let b = 0; b < h.length; b++) {
                    let e, i, j, k, l;
                    j = a.row + h[b][0], i = a.col + h[b][1];
                    if (!this.isClearanceBlocking(j, i)) continue;
                    e = g - this.getWorldXForPathCol(i), l = d - this.getWorldZForPathRow(j), k = Math.sqrt(e * e + l * l);
                    k <= 1e-4 || (c += e / k, f += l / k)
                }
                e = Math.sqrt(c * c + f * f);
                if (e <= 1e-4) return new Laya.Vector3(g, b, d);
                i = Math.max(Math.min(Math.abs(this.colStep), Math.abs(this.rowStep)), 1e-4) * this.antClearanceDistanceScale;
                return new Laya.Vector3(g + c / e * i, b, d + f / e * i)
            }
            getPathCellClearancePenalty(a, b, c) {
                let d;
                d = this.getCurrentPathCellId(a, b);
                if (d > 0) {
                    let e, f, g, h;
                    f = c ? this.futureClearancePenaltyMark : this.actualClearancePenaltyMark, e = c ? this.futureClearancePenaltyValue : this.actualClearancePenaltyValue, g = c ? this.futurePathSearchVersion : this.actualPathSearchVersion;
                    if (f[d] === g) return e[d] || 0;
                    h = this.computePathCellClearancePenalty(a, b, c);
                    return f[d] = g, e[d] = h, h
                }
                return this.computePathCellClearancePenalty(a, b, c)
            }
            computePathCellClearancePenalty(a, b, c) {
                let d, e, f, g;
                d = 0, g = 0;
                e = this.getStableSearchOffsets();
                for (let f = 0; f < e.length; f++) this.isClearanceBlocking(a + e[f][0], b + e[f][1], c) && (g++, d += this.antSideClearancePenalty);
                f = l.DiagonalSearchOffsets;
                for (let e = 0; e < f.length; e++) this.isClearanceBlocking(a + f[e][0], b + f[e][1], c) && (d += this.antDiagonalClearancePenalty);
                return g >= 2 && this.isTightPassageCell(a, b, c) && (d += this.antTightPassagePenalty), d
            }
            isTightPassageCell(a, b, c) {
                let d, e, f, g;
                e = this.isClearanceBlocking(a, b - 1, c), d = this.isClearanceBlocking(a, b + 1, c), f = this.isClearanceBlocking(a - 1, b, c), g = this.isClearanceBlocking(a + 1, b, c);
                return e && d || f && g
            }
            isClearanceBlocking(a, b, c) {
                return !!this.isPathCellInSearchBounds(a, b) && (!!this.isBlackHolePathCell(a, b) || (!c || !this.isPredictedClearCell(a, b)) && this.isBlocking(a, b))
            }
            pushClearanceStepWaypoint(a, b, c, d) {
                let e, f, g;
                e = a && a.length > 0 ? a[a.length - 1] : null;
                if (!e) return void this.pushWaypointIfChanged(a, d);
                f = Math.abs(e.x - d.x) <= .001, g = Math.abs(e.z - d.z) <= .001;
                f || g || (b && c && b.row !== c.row && b.col === c.col ? this.pushWaypointIfChanged(a, new Laya.Vector3(d.x, d.y, e.z)) : (b && c && b.col !== c.col && (b.row, c.row), this.pushWaypointIfChanged(a, new Laya.Vector3(e.x, d.y, d.z)))), this.pushWaypointIfChanged(a, d)
            }
            pushWaypointIfChanged(a, b) {
                let c;
                if (!a || !b) return;
                c = a.length > 0 ? a[a.length - 1] : null;
                c && Math.abs(c.x - b.x) <= .001 && Math.abs(c.y - b.y) <= .001 && Math.abs(c.z - b.z) <= .001 || a.push(b)
            }
            compactPathCells(a) {
                let b;
                if (!a || a.length <= 2) return a;
                b = [a[0]];
                for (let c = 1; c < a.length - 1; c++) {
                    let d, e, f, g, h;
                    e = b[b.length - 1], d = a[c], g = a[c + 1], f = e.row === d.row && d.row === g.row, h = e.col === d.col && d.col === g.col;
                    f || h || b.push(d)
                }
                return b.push(a[a.length - 1]), b
            }
            isDestinationByRowCol(a, b, c) {
                for (let d = 0; d < c.length; d++)
                    if (a === c[d].row && b === c[d].col) return !0;
                return !1
            }
            isSamePathCell(a, b) {
                return a.row === b.row && a.col === b.col
            }
            isPathCellInSearchBounds(a, b) {
                return a >= this.getMinPathRow() && a <= this.getMaxPathRow() && this.isPathColInSearchBounds(b)
            }
            isPathCellPassable(a, b, c, d) {
                if (!this.isPathColInSearchBounds(b)) return !1;
                if (!c && this.isBlackHolePathCell(a, b)) return !1;
                if (a < 0 || a >= this.grid.length) return !0;
                if (b < 0 || b >= this.columnCount) return !0;
                return !this.getCell(a, b) || (!(!d || !this.isPredictedClearCell(a, b)) || !this.isBlocking(a, b))
            }
            hasReachableExposedFace(a, b) {
                return this.isExteriorAirCell(a - 1, b) || this.isExteriorAirCell(a + 1, b) || this.isExteriorAirCell(a, b - 1) || this.isExteriorAirCell(a, b + 1)
            }
            isExteriorAirCell(a, b, c) {
                return !(!this.isPathColInSearchBounds(b) || !this.isAirCellPassable(a, b, c)) && (c ? (this.rebuildFutureExteriorAirIfNeeded(), this.futureExteriorAirMark[this.getCurrentPathCellId(a, b)] === this.futurePathSearchVersion) : (this.rebuildExteriorAirIfNeeded(), !!this.exteriorAirKeys[this.getKey(a, b)]))
            }
            rebuildExteriorAirIfNeeded() {
                let a, b, c, d, e, f;
                if (!this.exteriorAirDirty) return;
                if (this.exteriorAirDirty = !1, this.exteriorAirKeys = {}, this.columnCount <= 0) return;
                d = [], c = this.getMinPathCol(), e = this.getMaxPathCol(), f = this.getMinPathRow();
                this.seedExteriorAir(d, f, this.getMaxPathRow(), c, e, !1);
                b = 0;
                a = [
                    [1, 0],
                    [0, -1],
                    [0, 1],
                    [-1, 0]
                ];
                for (; b < d.length;) {
                    let c;
                    c = d[b++];
                    for (let b = 0; b < a.length; b++) this.addExteriorAirCell(d, c.row + a[b][0], c.col + a[b][1])
                }
            }
            addExteriorAirCell(a, b, c) {
                let d;
                if (!this.isPathCellInSearchBounds(b, c) || !this.isAirCellPassable(b, c)) return;
                d = this.getKey(b, c);
                this.exteriorAirKeys[d] || (this.exteriorAirKeys[d] = !0, a.push({
                    row: b,
                    col: c
                }))
            }
            rebuildFutureExteriorAirIfNeeded() {
                let a, b, c, d, e, f;
                if (!this.futureExteriorAirDirty) return;
                if (this.futureExteriorAirDirty = !1, this.futureExteriorAirKeys = {}, this.futureExteriorAirMark = [], this.resetFutureExteriorAirVisitLookup(), this.columnCount <= 0) return;
                c = this.acquireFutureExteriorAirQueue(), a = this.getMinPathCol(), e = this.getMaxPathCol(), b = this.getMinPathRow();
                this.seedExteriorAir(c, b, this.getMaxPathRow(), a, e, !0);
                d = 0;
                f = this.getStableSearchOffsets();
                for (; d < c.length;) {
                    let a;
                    a = c[d++];
                    for (let b = 0; b < f.length; b++) this.addFutureExteriorAirCell(c, a.row + f[b][0], a.col + f[b][1])
                }
            }
            addFutureExteriorAirCell(a, b, c) {
                this.isPathCellInSearchBounds(b, c) && this.isAirCellPassable(b, c, !0) && this.tryMarkFutureExteriorAirVisit(b, c) && (this.futureExteriorAirMark[this.getCurrentPathCellId(b, c)] = this.futurePathSearchVersion, this.enqueueFutureExteriorAirCell(a, b, c))
            }
            resetFutureExteriorAirVisitLookup() {}
            acquireFutureExteriorAirQueue() {
                return []
            }
            enqueueFutureExteriorAirCell(a, b, c) {
                a.push({
                    row: b,
                    col: c
                })
            }
            tryMarkFutureExteriorAirVisit(a, b) {
                let c;
                c = this.getKey(a, b);
                return !this.futureExteriorAirKeys[c] && (this.futureExteriorAirKeys[c] = !0, !0)
            }
            getFutureExteriorAirCellId(a, b) {
                return this.getCurrentPathCellId(a, b)
            }
            seedExteriorAir(a, b, c, d, e, f) {
                if (this.boardWallEnabled) return this.seedBottomExteriorAir(a, b, d, e, f), void this.seedQualifiedBoundaryOpenings(a, b, c, d, e, f);
                for (let g = d; g <= e; g++) f ? (this.addFutureExteriorAirCell(a, b, g), this.addFutureExteriorAirCell(a, c, g)) : (this.addExteriorAirCell(a, b, g), this.addExteriorAirCell(a, c, g));
                for (let g = b; g <= c; g++) f ? (this.addFutureExteriorAirCell(a, g, d), this.addFutureExteriorAirCell(a, g, e)) : (this.addExteriorAirCell(a, g, d), this.addExteriorAirCell(a, g, e))
            }
            seedBottomExteriorAir(a, b, c, d, e) {
                for (let f = c; f <= d; f++) this.addSeedExteriorAirCell(a, b, f, e)
            }
            seedQualifiedBoundaryOpenings(a, b, c, d, e, f) {
                let g;
                g = Math.max(1, this.boundaryExitConfig ? this.boundaryExitConfig.minOpeningCells : 2);
                this.seedVerticalBoundaryOpenings(a, 0, c, d, g, f), e !== d && this.seedVerticalBoundaryOpenings(a, 0, c, e, g, f), this.seedHorizontalBoundaryOpenings(a, c, d, e, g, f)
            }
            seedVerticalBoundaryOpenings(a, b, c, d, e, f) {
                let g, h;
                g = -1, h = 0;
                for (let i = b; i <= c + 1; i++) {
                    if (i <= c && this.isBoundaryOpeningCell(i, d, f)) g < 0 && (g = i, h = 0), h++;
                    else {
                        if (g >= 0 && h >= e)
                            for (let b = g; b < g + h; b++) this.addSeedExteriorAirCell(a, b, d, f);
                        g = -1, h = 0
                    }
                }
            }
            seedHorizontalBoundaryOpenings(a, b, c, d, e, f) {
                let g, h;
                h = -1, g = 0;
                for (let i = c; i <= d + 1; i++) {
                    if (i <= d && this.isBoundaryOpeningCell(b, i, f)) h < 0 && (h = i, g = 0), g++;
                    else {
                        if (h >= 0 && g >= e)
                            for (let c = h; c < h + g; c++) this.addSeedExteriorAirCell(a, b, c, f);
                        h = -1, g = 0
                    }
                }
            }
            isBoundaryOpeningCell(a, b, c) {
                return this.isPathCellInSearchBounds(a, b) && this.isAirCellPassable(a, b, c)
            }
            addSeedExteriorAirCell(a, b, c, d) {
                d ? this.addFutureExteriorAirCell(a, b, c) : this.addExteriorAirCell(a, b, c)
            }
            isAirCellPassable(a, b, c) {
                return !!this.isPathColInSearchBounds(b) && (!this.isBlackHolePathCell(a, b) && (a < 0 || a >= this.grid.length || (b < 0 || b >= this.columnCount || (!(!c || !this.isPredictedClearCell(a, b)) || !this.isBlocking(a, b)))))
            }
            markExteriorAirDirty() {
                this.exteriorAirDirty = !0, this.futureExteriorAirDirty = !0, this.invalidateActualPathSearchCache()
            }
            markFutureFrontierDirty() {
                this.futureFrontierDirty = !0, this.futureExteriorAirDirty = !0, this.invalidateFuturePathSearchCache()
            }
            invalidatePathSearchCache() {
                this.invalidateActualPathSearchCache()
            }
            invalidateActualPathSearchCache() {
                this.actualPathSearchVersion++, this.actualPathSearchCache = {}, this.actualPathSearchCacheKeys = [], this.actualClearancePenaltyMark = [], this.actualClearancePenaltyValue = [], this.noTargetUntilByKey = {}, this.invalidateFuturePathSearchCache()
            }
            invalidateFuturePathSearchCache() {
                this.futurePathSearchVersion++, this.futurePathSearchCache = {}, this.futurePathSearchCacheKeys = [], this.futureExteriorAirMark = [], this.futureClearancePenaltyMark = [], this.futureClearancePenaltyValue = [], this.noTargetUntilByKey = {}
            }
            rebuildFrontier() {
                this.frontierByColor = {}, this.frontierKeysByColor = {};
                for (let a = 0; a < this.columnCount; a++)
                    for (let b = 0; b < this.grid.length; b++) this.refreshCellFrontier(b, a)
            }
            clampPathCell(a) {
                let b, c, d, e, f, g;
                f = a.row, c = a.col;
                b = this.getMinPathRow(), e = this.getMaxPathRow(), g = this.getMinPathCol(), d = this.getMaxPathCol();
                return f < b ? f = b : f > e && (f = e), c < g ? c = g : c > d && (c = d), {
                    row: f,
                    col: c
                }
            }
            getMinPathRow() {
                let a;
                a = -this.bottomPathExtraRows;
                return this.blackHolePathCell && this.blackHolePathCell.row <= -1 && (a = Math.min(a, this.blackHolePathCell.row - 2)), Math.min(a, -1)
            }
            getMaxPathRow() {
                return this.boardWallEnabled ? this.grid.length - 1 : this.grid.length
            }
            isPathColInSearchBounds(a) {
                return a >= this.getMinPathCol() && a <= this.getMaxPathCol()
            }
            getMinPathCol() {
                return this.boardWallEnabled ? 0 : -1
            }
            getMaxPathCol() {
                return this.boardWallEnabled ? this.columnCount - 1 : this.columnCount
            }
            isBlackHolePathCell(a, b) {
                return !!this.blackHolePathCell && (Math.abs(this.blackHolePathCell.row - a) <= this.blackHoleAvoidRadiusCells && Math.abs(this.blackHolePathCell.col - b) <= this.blackHoleAvoidRadiusCells)
            }
            isSegmentCrossBlackHoleBlockedArea(a, b, c, d) {
                let e;
                e = this.getBlackHoleBlockedWorldBounds();
                return !!e && this.isSegmentIntersectRect(a, b, c, d, e.minX, e.maxX, e.minZ, e.maxZ)
            }
            getBlackHoleBlockedWorldBounds() {
                let a, b, c, d, e, f, g;
                if (!this.blackHolePathCell) return null;
                a = this.getWorldXForPathCol(this.blackHolePathCell.col - this.blackHoleAvoidRadiusCells), e = this.getWorldXForPathCol(this.blackHolePathCell.col + this.blackHoleAvoidRadiusCells), b = this.getWorldZForPathRow(this.blackHolePathCell.row - this.blackHoleAvoidRadiusCells), f = this.getWorldZForPathRow(this.blackHolePathCell.row + this.blackHoleAvoidRadiusCells), c = Math.max(.5 * Math.abs(this.colStep), 1e-4), d = Math.max(.5 * Math.abs(this.rowStep), 1e-4), g = Math.max(Math.min(c, d) * this.blackHoleStartSegmentMarginScale, .05);
                return {
                    minX: Math.min(a, e) - c - g,
                    maxX: Math.max(a, e) + c + g,
                    minZ: Math.min(b, f) - d - g,
                    maxZ: Math.max(b, f) + d + g
                }
            }
            isSegmentIntersectRect(a, b, c, d, e, f, g, h) {
                let i, j, k, l, m, n;
                m = c - a, i = d - b, n = [-m, m, -i, i], l = [a - e, f - a, b - g, h - b];
                k = 0, j = 1;
                for (let a = 0; a < n.length; a++) {
                    let b;
                    if (Math.abs(n[a]) <= 1e-4) {
                        if (l[a] < 0) return !1;
                        continue
                    }
                    b = l[a] / n[a];
                    if (n[a] < 0) {
                        if (b > j) return !1;
                        b > k && (k = b)
                    } else {
                        if (b < k) return !1;
                        b < j && (j = b)
                    }
                }
                return k <= j
            }
            resetPredictedClearLookup() {}
            addPredictedClearLookup(a, b) {}
            getPredictedClearCellId(a, b) {
                return a < 0 || a >= this.grid.length || b < 0 || b >= this.columnCount ? 0 : a * this.columnCount + b + 1
            }
            isPredictedClearCell(a, b) {
                return this.predictedClearTimeByKey.hasOwnProperty(this.getKey(a, b))
            }
            getCannonFirePosition(a) {
                let b;
                b = a ? a.__boardWalkerPlanningPosition : null;
                return b || (a && a.sp3 && !a.sp3.destroyed ? a.sp3.transform.position : null)
            }
            getBottomEntryCellFromWorld(a) {
                return this.clampPathCell({
                    row: -1,
                    col: this.getNearestPathIndex(this.colWorldX, a.x)
                })
            }
            getNearestPathIndex(a, b) {
                let c, d, e, f;
                if (!a || 0 === a.length) return 0;
                e = a[0], f = this.getAxisStep(a, 1);
                if (Math.abs(f) > 1e-4) {
                    let c;
                    c = Math.round((b - e) / f);
                    if (c < 0 || c >= a.length) return c
                }
                c = 0, d = Math.abs(b - a[0]);
                for (let e = 1; e < a.length; e++) {
                    let f;
                    f = Math.abs(b - a[e]);
                    f < d && (d = f, c = e)
                }
                return c
            }
            getWorldXForPathCol(a) {
                return this.colWorldX && 0 !== this.colWorldX.length ? a < 0 ? this.colWorldX[0] - this.colStep : a >= this.colWorldX.length ? this.colWorldX[this.colWorldX.length - 1] + this.colStep : this.colWorldX[a] : a
            }
            getWorldZForPathRow(a) {
                return this.rowWorldZ && 0 !== this.rowWorldZ.length ? a < 0 ? this.rowWorldZ[0] + this.rowStep * a : a >= this.rowWorldZ.length ? this.rowWorldZ[this.rowWorldZ.length - 1] + this.rowStep * (a - this.rowWorldZ.length + 1) : this.rowWorldZ[a] : a
            }
            getPathDistanceScore(a, b) {
                let c;
                c = this.getCannonFirePosition(a);
                return c && b && 0 !== b.length ? this.getWorldPathDistance(c, b) : Number.MAX_VALUE
            }
            getWorldPathDistance(a, b) {
                let c, d, e;
                if (!a || !b || 0 === b.length) return 0;
                d = 0, c = a.x, e = a.z;
                for (let a = 0; a < b.length; a++) {
                    let f, g;
                    f = b[a].x - c, g = b[a].z - e;
                    d += Math.sqrt(f * f + g * g), c = b[a].x, e = b[a].z
                }
                return d
            }
            getNowMs() {
                return Laya && Laya.timer ? Laya.timer.currTimer : Date.now()
            }
            fillAxisValues(a, b, c) {
                let d, e, f;
                if (!a || b <= 0) return;
                e = -1, f = -1;
                for (let c = 0; c < b; c++)
                    if (this.isValidNumber(a[c])) {
                        if (e < 0 && (e = c), f >= 0 && c - f > 1) {
                            let b;
                            b = (a[c] - a[f]) / (c - f);
                            for (let d = f + 1; d < c; d++) a[d] = a[f] + b * (d - f)
                        }
                        f = c
                    } if (e < 0) {
                    for (let d = 0; d < b; d++) a[d] = d * c;
                    return
                }
                d = this.getAxisStep(a, c);
                for (let b = e - 1; b >= 0; b--) a[b] = a[b + 1] - d;
                for (let c = f + 1; c < b; c++) a[c] = a[c - 1] + d
            }
            getAxisStep(a, b) {
                if (!a || a.length <= 1) return b;
                for (let b = 1; b < a.length; b++)
                    if (this.isValidNumber(a[b]) && this.isValidNumber(a[b - 1])) {
                        let c;
                        c = a[b] - a[b - 1];
                        if (Math.abs(c) > 1e-4) return c
                    } return b
            }
            isValidNumber(a) {
                return "number" == typeof a && isFinite(a)
            }
            refreshCellFrontier(a, b) {
                let c;
                c = this.getCell(a, b);
                c && (this.isAliveCell(c) && this.isExposed(a, b) ? (this.removeFromFutureFrontier(c), this.addFrontier(c)) : this.removeFrontier(c))
            }
            canReserveCell(a, b) {
                return !!this.isAliveCell(a) && (a.colorRid === b && this.isExposed(a.row, a.col))
            }
            canReserveFutureCell(a, b) {
                return !(!this.isAliveCell(a) || a.colorRid !== b) && this.isCellInFutureFrontier(a)
            }
            isCellReserved(a) {
                return !!a && 2 === a.state
            }
            isCellInActualFrontier(a) {
                let b;
                if (!a) return !1;
                b = this.frontierKeysByColor[a.colorRid];
                return !!b && b.has(a.key)
            }
            isCellInFutureFrontier(a) {
                let b;
                if (!a) return !1;
                b = this.futureFrontierKeysByColor[a.colorRid];
                return !!b && b.has(a.key)
            }
            addFrontier(a) {
                let b, c;
                b = this.frontierByColor[a.colorRid];
                b || (b = [], this.frontierByColor[a.colorRid] = b);
                c = this.frontierKeysByColor[a.colorRid];
                c || (c = new Set, this.frontierKeysByColor[a.colorRid] = c), c.has(a.key) || (c.add(a.key), b.push(a))
            }
            removeFrontier(a) {
                let b;
                b = this.frontierKeysByColor[a.colorRid];
                b && b.delete(a.key)
            }
            removeFromFutureFrontier(a) {
                let b;
                if (!a) return;
                b = this.futureFrontierKeysByColor[a.colorRid];
                b && b.delete(a.key), delete this.futureReadyTimeByKey[a.key]
            }
            isBlocking(a, b) {
                let c;
                c = this.getCell(a, b);
                return !!c && (1 === c.state || 2 === c.state)
            }
            isAliveCell(a) {
                return !(!a || 1 !== a.state || !a.cube) && !(!a.cube.sp3 || a.cube.sp3.destroyed || a.cube.health <= 0)
            }
            getCell(a, b) {
                let c;
                if (a < 0 || b < 0 || a >= this.grid.length) return null;
                c = this.grid[a];
                return !c || b >= c.length ? null : c[b]
            }
            writeSourceCell(a, b, c, d) {
                this.sourceColorMap[a] && (this.sourceColorMap[a][b] = c), this.sourceScriptMap[a] && (this.sourceScriptMap[a][b] = d)
            }
            getKey(a, b) {
                return a + "_" + b
            }
            asCube(a) {
                return a && a.sp3 && "number" == typeof a.color_rid ? a : null
            }
        };
l.StableSearchOffsets = [
            [1, 0],
            [-1, 0],
            [0, -1],
            [0, 1]
        ], l.DiagonalSearchOffsets = [
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1]
        ], l.ClearNeighborOffsets = [
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0]
        ], l.PeelFocusNeighborOffsets = [
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0],
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1]
        ], l.ReturnSearchOffsetsDown = [
            [1, 0],
            [0, -1],
            [0, 1],
            [-1, 0]
        ], l.ReturnSearchOffsetsUp = [
            [-1, 0],
            [0, -1],
            [0, 1],
            [1, 0]
        ];

export const OriginalBoardState = l;
