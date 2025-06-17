module.exports = {
  fileExtensions: ['ts', 'tsx'],
  excludeRegExp: [
    'node_modules',
    '\\.test\\.',
    '\\.spec\\.',
    '__tests__',
    'dist',
    'coverage',
    '\\.d\\.ts$'
  ],
  tsConfig: './tsconfig.json',
  detectiveOptions: {
    ts: {
      skipTypeImports: true
    }
  },
  rankdir: 'TB', // Top to Bottom layout for graphs
  backgroundColor: '#ffffff',
  nodeColor: '#c6c5fe',
  noDependencyColor: '#cfffac',
  cyclicNodeColor: '#ff6c60',
  edgeColor: '#757575',
  graphVizOptions: {
    G: {
      rankdir: 'TB',
      bgcolor: '#ffffff',
      fontname: 'Arial',
      fontsize: '14',
      compound: 'true'
    },
    E: {
      color: '#757575',
      fontname: 'Arial',
      fontsize: '12'
    },
    N: {
      fontname: 'Arial',
      fontsize: '14',
      color: '#c6c5fe',
      shape: 'box',
      style: 'rounded,filled',
      fillcolor: '#f0f0f0'
    }
  }
};