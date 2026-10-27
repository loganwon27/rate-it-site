import { useEffect, useState } from 'preact/hooks';

// Hash routes: #/, #/discover, #/p/<id>, #/u/<id>, ...
function parse() {
  // Anything after "?" is options for the page (e.g. #/create?tag=deskweek), not part of the route.
  const path = window.location.hash.replace(/^#/, '').split('?')[0] || '/';
  const [name = '', ...params] = path.split('/').filter(Boolean);
  return { path, name, params };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path) {
  window.location.hash = path;
}

export function back(fallback = '/') {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback);
}
