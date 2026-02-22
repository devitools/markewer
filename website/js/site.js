(function () {
  var ua = navigator.userAgent.toLowerCase()
  var os = 'macos'
  if (ua.includes('win')) os = 'windows'
  else if (ua.includes('linux')) os = 'linux'

  var osLabel = { macos: 'macOS', linux: 'Linux', windows: 'Windows' }
  var ctaOs = document.getElementById('cta-os')
  if (ctaOs) ctaOs.textContent = osLabel[os]

  document.querySelectorAll('.download-card').forEach(function (card) {
    if (card.dataset.os === os) card.classList.add('highlighted')
  })

  var themes = ['system', 'light', 'dark']
  var current = localStorage.getItem('arandu-site-theme') || 'system'

  function applyTheme (theme) {
    current = theme
    localStorage.setItem('arandu-site-theme', theme)
    document.documentElement.classList.remove('light', 'dark')
    if (theme !== 'system') document.documentElement.classList.add(theme)
  }

  var toggle = document.getElementById('theme-toggle')
  if (toggle) {
    toggle.addEventListener('click', function () {
      var idx = themes.indexOf(current)
      applyTheme(themes[(idx + 1) % themes.length])
    })
  }

  applyTheme(current)

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        observer.unobserve(entry.target)
      }
    })
  }, { threshold: 0.1 })

  document.querySelectorAll('.fade-in').forEach(function (el) {
    observer.observe(el)
  })

  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var target = document.querySelector(a.getAttribute('href'))
      if (target) {
        e.preventDefault()
        target.scrollIntoView({ behavior: 'smooth' })
      }
    })
  })

  var outlineItems = document.querySelectorAll('.mockup-outline-item[data-target]')
  var mockupContent = document.querySelector('.mockup-content.markdown-body')

  if (outlineItems.length && mockupContent) {
    outlineItems.forEach(function (item) {
      item.addEventListener('click', function () {
        var target = document.getElementById(item.dataset.target)
        if (!target) return
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        outlineItems.forEach(function (el) { el.classList.remove('active') })
        item.classList.add('active')
      })
    })

    mockupContent.addEventListener('scroll', function () {
      var headings = mockupContent.querySelectorAll('h1[id], h2[id]')
      var scrollTop = mockupContent.scrollTop
      var active = headings[0]
      headings.forEach(function (h) {
        if (h.offsetTop - mockupContent.offsetTop <= scrollTop + 10) active = h
      })
      if (active) {
        outlineItems.forEach(function (el) {
          el.classList.toggle('active', el.dataset.target === active.id)
        })
      }
    })
  }
})()
