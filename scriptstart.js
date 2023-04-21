// Set the dimensions and margins for the chart

const margin = { top: 70, right: 30, bottom: 40, left: 80 };
const width = 1000 - margin.left - margin.right;
const height = 300 - margin.top - margin.bottom;

// Set up the x and y scales

const x = d3.scaleTime()
    .range([0, width]);

const y = d3.scaleLinear()
    .range([height, 0]);

// Create the SVG element and append it to the chart container

const svg = d3.select("chart-container")
    .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transfrom", `translate(${margin.left},${margin.top})`);

// dataset

const dataset = [ // Clemson Tiger Takedown - Our scores
    {date: new Date("Q1"), value: 120},
    {date: new Date("Q8"), value: 120},
    {date: new Date("Q17"), value: 98},
    {date: new Date("Q29"), value: 31},
    {date: new Date("Q36"), value: 55},
    {date: new Date("Q45"), value: 40},
    {date: new Date("Q50"), value: 93},
    {date: new Date("E16"), value: 111},
    {date: new Date("QF"), value: 84},
    {date: new Date("SF"), value: 94},
    {date: new Date("F1"), value: 25},
    {date: new Date("F2"), value: 47},
]

// Define the x and y domains

x.domain(d3.extent(dataset, d => d.date));
y.domain([0, d3.max(dataset, d => d.value)]);

// x-axis

svg.apped("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x))
        .ticks(d3.axisBottom(x)
        .ticks(d3.timeMonth.every(1))
        .tickFormat(d3.timeFormat("%b %Y")))

// y-axis

svg.append("g")
    .call(d3.axisLeft(y))


// Line generator

const line = d3.line()
    .x(d => x(d.date))
    .y(d => y(d.value))

// adding the line path the the SVG element

svg.append("path")
    .datum(dataset)
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 1)
    .attr("d", line);


