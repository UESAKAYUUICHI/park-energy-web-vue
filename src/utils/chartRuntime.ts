import type { ECharts } from 'echarts/core'

export interface BasicChartRuntime {
  init(element: HTMLElement): ECharts
  graphic: typeof import('echarts/core')['graphic']
}

export interface EfficiencyChartRuntime {
  init(element: HTMLElement): ECharts
}

let basicRuntime: Promise<BasicChartRuntime> | undefined
let efficiencyRuntime: Promise<EfficiencyChartRuntime> | undefined

export function loadBasicChartRuntime() {
  basicRuntime ??= Promise.all([
    import('echarts/core'),
    import('echarts/lib/chart/line/install'),
    import('echarts/lib/chart/bar/install'),
    import('echarts/lib/component/dataZoom/install'),
    import('echarts/lib/component/grid/install'),
    import('echarts/lib/component/legend/install'),
    import('echarts/lib/component/tooltip/install'),
    import('echarts/lib/renderer/installCanvasRenderer'),
  ]).then(([core, line, bar, dataZoom, grid, legend, tooltip, canvas]) => {
    core.use([
      line.install,
      bar.install,
      dataZoom.install,
      grid.install,
      legend.install,
      tooltip.install,
      canvas.install,
    ])
    return { init: core.init, graphic: core.graphic }
  })
  return basicRuntime
}

export function loadEfficiencyChartRuntime() {
  efficiencyRuntime ??= Promise.all([
    loadBasicChartRuntime(),
    import('echarts/lib/chart/pie/install'),
    import('echarts/lib/chart/radar/install'),
    import('echarts/lib/chart/gauge/install'),
    import('echarts/lib/chart/heatmap/install'),
    import('echarts/lib/chart/scatter/install'),
    import('echarts/lib/chart/treemap/install'),
    import('echarts/lib/component/marker/installMarkPoint'),
    import('echarts/lib/component/visualMap/install'),
  ]).then(([core, pie, radar, gauge, heatmap, scatter, treemap, markPoint, visualMap]) => {
    // Register the additional series only on the efficiency workbench.
    return import('echarts/core').then((echarts) => {
      echarts.use([
        pie.install,
        radar.install,
        gauge.install,
        heatmap.install,
        scatter.install,
        treemap.install,
        markPoint.install,
        visualMap.install,
      ])
      return { init: core.init }
    })
  })
  return efficiencyRuntime
}
