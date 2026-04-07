; class ArticlesController < ApplicationController (Rails convention)
(class
  name: (constant) @_name
  (#match? @_name "Controller$")) @class

; HTTP verb route helpers called in routes.rb or controller scope
(call
  method: (identifier) @_verb
  (#match? @_verb "^(get|post|put|patch|delete|head|options|resources|resource|namespace|scope|route|member|collection)$"))
