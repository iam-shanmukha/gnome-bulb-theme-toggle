UUID := bulb-theme-toggle@iam-shanmukha.github.io
DEST := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: pack install uninstall

pack:
	gnome-extensions pack --force --extra-source=bulb.js --extra-source=theme.js .

install: pack
	gnome-extensions install --force $(UUID).shell-extension.zip
	@echo "Log out and back in (Wayland), then: gnome-extensions enable $(UUID)"

uninstall:
	gnome-extensions uninstall $(UUID)
