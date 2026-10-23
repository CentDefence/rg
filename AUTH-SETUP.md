# Подключение регистрации Rill

В интерфейсе доступны два способа входа: Google OAuth и одноразовая ссылка на email. Для обоих способов нужен собственный проект Supabase. Этот проект пока отвечает только за личность пользователя: локальные аудиофайлы, плейлисты, тексты и история между устройствами не синхронизируются.

## 1. Создать проект Supabase

1. Создайте проект в [Supabase](https://supabase.com/dashboard).
2. В настройках проекта скопируйте Project URL и публичный `anon` / publishable key.
3. Впишите их в `auth-config.js`:

```js
window.RILL_AUTH_CONFIG = {
  url: 'https://YOUR_PROJECT.supabase.co',
  anonKey: 'YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY'
};
```

Публичный ключ предназначен для клиентского приложения. Не вставляйте сюда `service_role` или secret key.

## 2. Разрешить адрес сайта

В Supabase откройте Authentication → URL Configuration. Укажите адрес опубликованного сайта как Site URL, затем добавьте его в Redirect URLs. Для локальной разработки добавьте адрес, который показывает ваш сервер, например `http://localhost:4173/**`.

## 3. Включить вход по ссылке на email

В Authentication → Sign In / Providers включите Email. Rill отправляет magic link и не хранит пароль. Для надёжной отправки писем на реальном сайте настройте SMTP у почтового провайдера в Supabase.

## 4. Включить Google

1. Создайте OAuth client типа Web application в [Google Cloud Console](https://console.cloud.google.com/).
2. Добавьте origin сайта в Authorized JavaScript origins.
3. Скопируйте callback URL, показанный на странице Google provider в Supabase, в Authorized redirect URIs Google.
4. Вставьте Google Client ID и Client Secret в настройки Google provider в Supabase. Client Secret хранится только в Supabase, никогда в `auth-config.js`.
5. В Supabase включите Google provider и добавьте адрес опубликованного сайта в Redirect URLs.

После сохранения перезагрузите приложение. Кнопки входа начнут открывать Google OAuth и отправлять ссылки на email.

## Ограничения текущей версии

Google/email подтверждают учётную запись. Для синхронизации плейлистов, настроек, истории и аудио между устройствами отдельно нужны таблицы базы данных, правила доступа RLS и серверная стратегия хранения файлов.
