const donutCtx = document.getElementById("donutChart");
const barCtx = document.getElementById("barChart");

new Chart(donutCtx, {
  type: "doughnut",
  data: {
    labels: ["Duke", "ISPY1", "ISPY2", "Advanced", "NACT"],
    datasets: [{
      data: [922, 212, 985, 59, 46 ]
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    events: ["mousemove", "mouseout", "click", "touchstart", "touchmove"],
    interaction: {
      mode: "nearest",
      intersect: true
    },
    plugins: {
      legend: {
        position: "bottom"
      },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (context) => `${context.label}: ${context.parsed}`
        }
      }
    },
    onClick: (event, elements, chart) => {
      if (!elements.length) return;
      const active = elements[0];
      chart.setActiveElements([active]);
      chart.tooltip.setActiveElements([active], {
        x: event.x,
        y: event.y
      });
      chart.update();
    }
  }
});

new Chart(barCtx, {
    type: "bar",
    data: {
      labels: ["Duke", "NACT Pilot", "ISPY1", "ISPY2", "Advanced"],
      datasets: [
        {
          label: "Luminal A",
          data: [64.5, 40.0, 36.3, 38.7, 15.8]
        },
        {
          label: "Luminal B",
          data: [11.3, 17.8, 7.1, 15.8, 49.1]
        },
        {
          label: "HER2+",
          data: [6.4, 17.8, 31.6, 8.9, 15.8]
        },
        {
          label: "Triplo Negativo",
          data: [17.8, 24.4, 25.0, 36.5, 19.3]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      events: ["mousemove", "mouseout", "click", "touchstart", "touchmove"],
      interaction: {
        mode: "nearest",
        intersect: true
      },
      plugins: {
        tooltip: {
          enabled: true,
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.y}%`
          }
        }
      },
      onClick: (event, elements, chart) => {
        if (!elements.length) return;
        const active = elements[0];
        chart.setActiveElements([active]);
        chart.tooltip.setActiveElements([active], {
          x: event.x,
          y: event.y
        });
        chart.update();
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100
        }
      }
    }
  });

  const subtiposCtx = document.getElementById("subtiposChart");
  new Chart(subtiposCtx, {
    type: "bar",
    data: {
      labels: ["Luminal A", "Luminal B", "HER2+", "Triplo Negativo"],
      datasets: [{
        data: [1080, 311, 231, 599],
        backgroundColor: [
          "#60a5fa",
          "#f9a8d4",
          "#fdba74",
          "#fcd34d"
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      events: ["mousemove", "mouseout", "click", "touchstart", "touchmove"],
      interaction: {
        mode: "nearest",
        intersect: true
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: true,
          callbacks: {
            label: (context) => `${context.label}: ${context.parsed.y} casos`
          }
        }
      },
      onClick: (event, elements, chart) => {
        if (!elements.length) return;
        const active = elements[0];
        chart.setActiveElements([active]);
        chart.tooltip.setActiveElements([active], {
          x: event.x,
          y: event.y
        });
        chart.update();
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });