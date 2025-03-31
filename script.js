// 全局变量
let fullGraphData = {
    nodes: [],
    links: []
};
let displayedGraphData = {
    nodes: [],
    links: []
};
let selectedNodeId = null;
let constructionData = {};
let relationsData = {};
let simulation = null;
let svg = null;
let zoom = null;
let searchTimeout = null;
let allNodeNames = [];
let isDragging = false;
let isMobile = window.innerWidth <= 768;
let nodeElements = null;
let linkElements = null;

// 颜色映射
const relationColors = {
    'polysemi': '#e67e22',
    'instantiation': '#3498db',
    'subpart': '#2ecc71'
};

// 全局拖拽函数
function dragstarted(event, d) {
    if (!event.active && simulation) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
    isDragging = true;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event, d) {
    if (!event.active && simulation) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
    isDragging = false;
}

// 初始化函数
async function init() {
    // 创建图例（移动端不显示）
    createLegend();

    // 加载数据
    await loadData();

    // 初始化搜索功能
    initSearch();

    // 初始化移动端侧边栏
    initMobileSidebar();

    // 初始化图形
    drawGraph();

    // 随机选择一个有连接的节点作为初始节点
    selectRandomConnectedNode();

    // 收集所有节点名称用于搜索建议
    allNodeNames = fullGraphData.nodes.map(node => ({
        id: node.id,
        name: node.name,
        searchText: `${node.id} ${formatConstructionName(node.name)}`
    }));

    selectRandomConnectedNode();
}

// 创建图例（移动端不显示）
function createLegend() {
    if (isMobile) return;

    const legendHtml = `
        <h3>图例</h3>
        <div class="legend-item">
            <svg width="40" height="20">
                <line x1="5" y1="10" x2="35" y2="10" stroke="#e67e22" stroke-width="2"></line>
                <polygon points="5,10 10,7 10,13" fill="#e67e22"></polygon>
                <polygon points="35,10 30,7 30,13" fill="#e67e22"></polygon>
            </svg>
            <span>polysemi</span>
        </div>
        <div class="legend-item">
            <svg width="40" height="20">
                <line x1="5" y1="10" x2="35" y2="10" stroke="#3498db" stroke-width="2"></line>
                <polygon points="35,10 30,7 30,13" fill="#3498db"></polygon>
            </svg>
            <span>instantiation</span>
        </div>
        <div class="legend-item">
            <svg width="40" height="20">
                <line x1="5" y1="10" x2="35" y2="10" stroke="#2ecc71" stroke-width="2"></line>
                <polygon points="35,10 30,7 30,13" fill="#2ecc71"></polygon>
            </svg>
            <span>subpart</span>
        </div>
    `;

    // 先移除旧的图例
    d3.select('.legend').remove();

    // 添加新图例
    d3.select('#graph').append('div')
        .attr('class', 'legend')
        .html(legendHtml);
}

// 初始化移动端侧边栏
function initMobileSidebar() {
    if (!isMobile) return;

    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');

    if (sidebarToggle) {
        // 初始状态为展开
        sidebar.classList.add('expanded');

        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('expanded');
            // 收起时滚动到底部
            if (!sidebar.classList.contains('expanded')) {
                setTimeout(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                }, 10);
            }
        });
    }
}

// 加载数据
async function loadData() {
    try {
        const [constructionResponse, relationsResponse] = await Promise.all([
            fetch('/data/constructions.json'),
            fetch('/data/relations.json')
        ]);

        constructionData = await constructionResponse.json();
        relationsData = await relationsResponse.json();

        // 处理完整数据
        processFullData();
    } catch (error) {
        console.error('Error loading data:', error);
        alert('加载数据失败，请检查数据文件是否存在');
    }
}

// 处理完整数据
function processFullData() {
    // 处理节点
    for (const [id, nodeData] of Object.entries(constructionData)) {
        fullGraphData.nodes.push({
            id: id,
            name: nodeData.form,
            encoded: nodeData.encoded,
            examples: nodeData.examples,
            x: Math.random() * 500,
            y: Math.random() * 500
        });
    }

    // 处理边
    for (const [sourceId, targets] of Object.entries(relationsData)) {
        for (const [targetId, relationData] of Object.entries(targets)) {
            // 添加边
            fullGraphData.links.push({
                source: sourceId,
                target: targetId,
                relation: relationData.relation,
                direction: relationData.direction
            });

            // 如果是双向关系，添加反向边
            if (relationData.direction === 'bi-directional') {
                fullGraphData.links.push({
                    source: targetId,
                    target: sourceId,
                    relation: relationData.relation,
                    direction: 'bi-directional'
                });
            }
        }
    }
}

// 初始化搜索功能
function initSearch() {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const randomButton = document.getElementById('random-button');
    const suggestionsContainer = document.getElementById('search-suggestions');

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const searchTerm = searchInput.value.trim();

        if (searchTerm.length === 0) {
            suggestionsContainer.style.display = 'none';
            return;
        }

        searchTimeout = setTimeout(() => {
            showSearchSuggestions(searchTerm);
        }, 200);
    });

    searchInput.addEventListener('focus', () => {
        const searchTerm = searchInput.value.trim();
        if (searchTerm.length > 0) {
            showSearchSuggestions(searchTerm);
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            suggestionsContainer.style.display = 'none';
        }
    });

    searchButton.addEventListener('click', () => {
        const searchTerm = searchInput.value.trim();
        if (searchTerm) searchNode(searchTerm);
        suggestionsContainer.style.display = 'none';
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const searchTerm = searchInput.value.trim();
            if (searchTerm) searchNode(searchTerm);
            suggestionsContainer.style.display = 'none';
        }
    });

    randomButton.addEventListener('click', () => {
        selectRandomConnectedNode();
        suggestionsContainer.style.display = 'none';
    });
}

// 显示搜索建议
function showSearchSuggestions(searchTerm) {
    const suggestionsContainer = document.getElementById('search-suggestions');
    suggestionsContainer.innerHTML = '';

    if (!searchTerm) {
        suggestionsContainer.style.display = 'none';
        return;
    }

    const lowerSearchTerm = searchTerm.toLowerCase();
    const matchedNodes = allNodeNames
        .filter(node => node.searchText.toLowerCase().includes(lowerSearchTerm))
        .slice(0, 5);

    if (matchedNodes.length === 0) {
        suggestionsContainer.style.display = 'none';
        return;
    }

    matchedNodes.forEach(node => {
        const item = document.createElement('div');
        item.className = 'search-suggestion-item';
        item.innerHTML = `
            <div><strong>${node.id}</strong>: ${formatConstructionName(node.name)}</div>
        `;
        item.addEventListener('click', () => {
            document.getElementById('search-input').value = '';
            suggestionsContainer.style.display = 'none';
            selectNode(node.id);
        });
        suggestionsContainer.appendChild(item);
    });

    suggestionsContainer.style.display = 'block';
}

// 搜索节点
function searchNode(searchTerm) {
    const foundNodes = fullGraphData.nodes.filter(node =>
        node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        node.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (foundNodes.length > 0) {
        selectNode(foundNodes[0].id);
    } else {
        alert('未找到匹配的构式');
    }
}

// 随机选择有连接的节点
function selectRandomConnectedNode() {
    const connectedNodeIds = new Set();
    fullGraphData.links.forEach(link => {
        connectedNodeIds.add(link.source);
        connectedNodeIds.add(link.target);
    });

    const connectedNodes = fullGraphData.nodes.filter(node => connectedNodeIds.has(node.id));
    if (connectedNodes.length > 0) {
        const randomNode = connectedNodes[Math.floor(Math.random() * connectedNodes.length)];
        selectNode(randomNode.id);
    } else {
        selectNode(fullGraphData.nodes[0]?.id || null);
    }
}

// 选择节点
function selectNode(nodeId) {
    if (!nodeId) {
        selectedNodeId = null;
        updateSidebar();
        if (nodeElements) {
            nodeElements.classed('selected', false);
            nodeElements.select('circle').attr('fill', 'url(#node-gradient)');
        }
        return;
    }

    selectedNodeId = nodeId;
    extractThreeLevelData(nodeId);
    updateGraph();
    updateSidebar();
}

// 提取三级节点数据
function extractThreeLevelData(centerNodeId) {
    const visitedNodes = new Set();
    const nodesToDisplay = new Set();
    const linksToDisplay = new Set();

    const queue = [{ nodeId: centerNodeId, level: 0 }];
    visitedNodes.add(centerNodeId);
    nodesToDisplay.add(centerNodeId);

    while (queue.length > 0) {
        const current = queue.shift();
        if (current.level >= 3) continue;

        const connections = fullGraphData.links.filter(link =>
            link.source === current.nodeId || link.target === current.nodeId
        );

        for (const link of connections) {
            const neighborId = link.source === current.nodeId ? link.target : link.source;
            linksToDisplay.add(JSON.stringify(link));

            if (!visitedNodes.has(neighborId)) {
                visitedNodes.add(neighborId);
                nodesToDisplay.add(neighborId);
                queue.push({ nodeId: neighborId, level: current.level + 1 });
            }
        }
    }

    // 保留现有节点的位置信息
    const oldNodes = new Map();
    displayedGraphData.nodes.forEach(node => {
        oldNodes.set(node.id, { x: node.x, y: node.y });
    });

    displayedGraphData.nodes = fullGraphData.nodes.filter(node => nodesToDisplay.has(node.id));

    // 恢复或设置初始位置
    displayedGraphData.nodes.forEach(node => {
        if (oldNodes.has(node.id)) {
            const oldPos = oldNodes.get(node.id);
            node.x = oldPos.x;
            node.y = oldPos.y;
            node.fx = undefined;
            node.fy = undefined;
        } else {
            node.x = Math.random() * 500;
            node.y = Math.random() * 500;
        }
    });

    displayedGraphData.links = Array.from(linksToDisplay).map(str => JSON.parse(str))
        .map(link => ({
            ...link,
            source: displayedGraphData.nodes.find(n => n.id === link.source) || link.source,
            target: displayedGraphData.nodes.find(n => n.id === link.target) || link.target
        }));
}

// 格式化构式名称
function formatConstructionName(name) {
    return name.replace(/-+/g, '-').replace(/[<>]/g, '');
}

// 绘制图谱（初次绘制）
function drawGraph() {
    const graphContainer = document.getElementById('graph');
    const width = graphContainer.clientWidth;
    const height = graphContainer.clientHeight;

    // 清除旧的SVG内容但保留图例
    d3.select('#graph').select('svg').remove();

    // 创建新SVG
    svg = d3.select('#graph')
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    // 创建组用于缩放
    const g = svg.append('g');

    // 初始化缩放行为
    zoom = d3.zoom()
        .scaleExtent([0.5, 3])
        .on('zoom', (event) => {
            if (!isDragging) {
                g.attr('transform', event.transform);
            }
        });
    svg.call(zoom);

    // 停止旧模拟
    if (simulation) simulation.stop();

    // 创建力导向图模拟
    simulation = d3.forceSimulation(displayedGraphData.nodes)
        .force('link', d3.forceLink(displayedGraphData.links).id(d => d.id).distance(120))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(40))
        .alphaDecay(0.02)
        .velocityDecay(0.4);

    // 创建SVG渐变
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
        .attr('id', 'node-gradient')
        .attr('x1', '0%').attr('y1', '0%')
        .attr('x2', '100%').attr('y2', '100%');

    gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#3498db');
    gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#2c3e50');

    // 绘制箭头定义
    defs.selectAll('.arrowhead').remove();
    defs.append('marker')
        .attr('id', 'arrowhead-polysemi')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 22)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#e67e22');

    defs.append('marker')
        .attr('id', 'arrowhead-instantiation')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 22)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#3498db');

    defs.append('marker')
        .attr('id', 'arrowhead-subpart')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 22)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#2ecc71');

    // 绘制边
    linkElements = g.append('g')
        .selectAll('line')
        .data(displayedGraphData.links)
        .enter().append('line')
        .attr('class', d => `link link-${d.relation}`)
        .attr('stroke-width', 2)
        .attr('stroke', d => relationColors[d.relation]);

    // 为需要箭头的边添加标记
    linkElements.filter(d => d.direction !== 'bi-directional')
        .attr('marker-end', d => `url(#arrowhead-${d.relation})`);
    // 为双向边添加双箭头
    linkElements.filter(d => d.direction === 'bi-directional')
        .attr('marker-start', d => `url(#arrowhead-${d.relation})`)
        .attr('marker-end', d => `url(#arrowhead-${d.relation})`);

    // 绘制节点
    nodeElements = g.append('g')
        .selectAll('g')
        .data(displayedGraphData.nodes)
        .enter().append('g')
        .attr('class', d => `node ${d.id === selectedNodeId ? 'selected' : ''}`)
        .attr('data-id', d => d.id)
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended))
        .on('click', function(event, d) {
            event.stopPropagation();
            if (!isDragging) {
                selectNode(d.id);
            }
            isDragging = false;
        });

    // 添加节点圆形
    nodeElements.append('circle')
        .attr('r', 15)
        .attr('fill', d => d.id === selectedNodeId ? '#e74c3c' : 'url(#node-gradient)');

    // 添加节点文本
    nodeElements.append('text')
        .attr('dy', -20)
        .attr('text-anchor', 'middle')
        .text(d => formatConstructionName(d.name))
        .call(wrapText, 100);

    // 添加节点ID
    nodeElements.append('text')
        .attr('dy', 30)
        .attr('text-anchor', 'middle')
        .attr('class', 'node-subtext')
        .text(d => `ID: ${d.id}`);

    // 添加节点光环效果
    nodeElements.append('circle')
        .attr('r', 18)
        .attr('fill', 'none')
        .attr('stroke', '#3498db')
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.3)
        .attr('class', 'node-halo');

    // 更新位置
    simulation.on('tick', () => {
        linkElements
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        nodeElements.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // 点击空白处，清除选中状态
    svg.on('click', () => {
        if (!isDragging) {
            d3.selectAll('.node').classed('selected', false);
            d3.selectAll('.node circle').attr('fill', 'url(#node-gradient)');
            selectedNodeId = null;
            updateSidebar();
        }
        isDragging = false;
    });
    createLegend();
}

// 更新图形（用于切换节点后更新数据）
function updateGraph() {
    if (!svg) {
        drawGraph();
        return;
    }

    // 更新模拟数据
    simulation.nodes(displayedGraphData.nodes);
    simulation.force('link').links(displayedGraphData.links);

    // 获取当前SVG组
    const g = svg.select('g');

    // 更新边
    linkElements = g.selectAll('line.link')
        .data(displayedGraphData.links, d => `${d.source.id}-${d.target.id}-${d.relation}`)
        .join(
            enter => {
                const newLinks = enter.append('line')
                    .attr('class', d => `link link-${d.relation}`)
                    .attr('stroke-width', 2)
                    .attr('stroke', d => relationColors[d.relation]);

                newLinks.filter(d => d.direction !== 'bi-directional')
                    .attr('marker-end', d => `url(#arrowhead-${d.relation})`);
                newLinks.filter(d => d.direction === 'bi-directional')
                    .attr('marker-start', d => `url(#arrowhead-${d.relation})`)
                    .attr('marker-end', d => `url(#arrowhead-${d.relation})`);
                return newLinks;
            },
            update => update,
            exit => exit.remove()
        );

    // 更新节点
    nodeElements = g.selectAll('g.node')
        .data(displayedGraphData.nodes, d => d.id)
        .join(
            enter => {
                const newNodes = enter.append('g')
                    .attr('class', d => `node ${d.id === selectedNodeId ? 'selected' : ''}`)
                    .attr('data-id', d => d.id)
                    .call(d3.drag()
                        .on('start', dragstarted)
                        .on('drag', dragged)
                        .on('end', dragended))
                    .on('click', function(event, d) {
                        event.stopPropagation();
                        if (!isDragging) {
                            selectNode(d.id);
                        }
                        isDragging = false;
                    });

                newNodes.append('circle')
                    .attr('r', 15)
                    .attr('fill', d => d.id === selectedNodeId ? '#e74c3c' : 'url(#node-gradient)');

                newNodes.append('text')
                    .attr('dy', -20)
                    .attr('text-anchor', 'middle')
                    .text(d => formatConstructionName(d.name))
                    .call(wrapText, 100);

                newNodes.append('text')
                    .attr('dy', 30)
                    .attr('text-anchor', 'middle')
                    .attr('class', 'node-subtext')
                    .text(d => `ID: ${d.id}`);

                newNodes.append('circle')
                    .attr('r', 18)
                    .attr('fill', 'none')
                    .attr('stroke', '#3498db')
                    .attr('stroke-width', 1)
                    .attr('stroke-opacity', 0.3)
                    .attr('class', 'node-halo');

                return newNodes;
            },
            update => {
                update.attr('class', d => `node ${d.id === selectedNodeId ? 'selected' : ''}`)
                    .select('circle')
                    .attr('fill', d => d.id === selectedNodeId ? '#e74c3c' : 'url(#node-gradient)');
                return update;
            },
            exit => exit.remove()
        );

    // 重新启动力导向模拟
    simulation.alpha(0.3).restart();
}

// 文本换行
function wrapText(text, width) {
    text.each(function() {
        const textEl = d3.select(this);
        const words = textEl.text().split(/\s+/).reverse();
        let word, line = [], lineNumber = 0;
        const y = textEl.attr("y"), dy = parseFloat(textEl.attr("dy"));
        let tspan = textEl.text(null).append("tspan")
            .attr("x", 0)
            .attr("y", y)
            .attr("dy", dy + "px");

        while (word = words.pop()) {
            line.push(word);
            tspan.text(line.join(" "));
            if (tspan.node().getComputedTextLength() > width) {
                line.pop();
                tspan.text(line.join(" "));
                line = [word];
                tspan = textEl.append("tspan")
                    .attr("x", 0)
                    .attr("y", y)
                    .attr("dy", ++lineNumber * 1.1 + dy + "px")
                    .text(word);
            }
        }
    });
}

// 更新侧边栏
function updateSidebar() {
    const connectionsList = document.getElementById('connections-list');
    const examplesList = document.getElementById('examples-list');

    connectionsList.innerHTML = '';
    examplesList.innerHTML = '';

    if (!selectedNodeId) {
        connectionsList.innerHTML = '<tr><td colspan="4">未选择节点</td></tr>';
        return;
    }

    const currentNode = fullGraphData.nodes.find(n => n.id === selectedNodeId);
    if (!currentNode) return;

    // 处理连接节点 - 使用 Set 去重
    const connectionsMap = new Map();
    displayedGraphData.links
        .filter(link => link.source.id === selectedNodeId || link.target.id === selectedNodeId)
        .forEach(link => {
            const isOutgoing = link.source.id === selectedNodeId;
            const connectedNodeId = isOutgoing ? link.target.id : link.source.id;
            const connectedNode = fullGraphData.nodes.find(n => n.id === connectedNodeId);
            const key = `${connectedNodeId}-${link.relation}-${link.direction}`;
            if (!connectionsMap.has(key)) {
                connectionsMap.set(key, {
                    nodeId: connectedNodeId,
                    nodeName: formatConstructionName(connectedNode.name),
                    relation: link.relation,
                    direction: link.direction,
                    isOutgoing: isOutgoing
                });
            }
        });
    const uniqueConnections = Array.from(connectionsMap.values());

    if (uniqueConnections.length === 0) {
        connectionsList.innerHTML = '<tr><td colspan="4">无连接节点</td></tr>';
    } else {
        uniqueConnections.forEach(conn => {
            const row = document.createElement('tr');
            row.className = 'connection-row';
            row.innerHTML = `
                <td class="connection-id">${conn.nodeId}</td>
                <td class="connection-name" title="${conn.nodeName}">${conn.nodeName}</td>
                <td class="connection-relation">${conn.relation}</td>
                <td class="connection-direction">
                    ${conn.direction === 'bi-directional' ? '双向' : conn.isOutgoing ? '出向' : '入向'}
                </td>
            `;
            row.addEventListener('click', () => {
                selectNode(conn.nodeId);
            });
            connectionsList.appendChild(row);
        });
    }

    // 显示示例
    if (currentNode.examples && currentNode.examples.length > 0) {
        currentNode.examples.forEach(example => {
            const item = document.createElement('div');
            item.className = 'example-item';
            item.textContent = example;
            examplesList.appendChild(item);
        });
    } else {
        examplesList.innerHTML = '<div class="example-item">无实例化示例</div>';
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', init);